// OWNER: Person A (voice & AI).
// Natural phone conversation through Twilio ConversationRelay: Twilio streams her speech to
// us as text over a WebSocket and speaks our replies with a natural voice. She can interrupt,
// and there's no "beep, now talk" turn-taking. Needs VOICE_MODE=relay and a paid Twilio account with the AI/ML addendum on.
import { WebSocketServer } from 'ws';
import * as store from '../store.js';
import { addTurn } from './checkins.js';
import { VOICE } from './notify.js';

export const relayEnabled = () => process.env.VOICE_MODE === 'relay';

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// "Google.en-US-Chirp3-HD-Aoede" → Google + en-US-Chirp3-HD-Aoede; "Polly.Joanna-Neural" → Amazon + Joanna-Neural.
function ttsFor(voice) {
  const [provider, ...rest] = voice.split('.');
  const name = rest.join('.');
  if (provider === 'Google') return { ttsProvider: 'Google', voice: name };
  if (provider === 'Polly') return { ttsProvider: 'Amazon', voice: name.replace(/-(Neural|Generative)$/, '') };
  return { ttsProvider: 'Google', voice: 'en-US-Chirp3-HD-Aoede' };
}

export function relayTwiml(checkin) {
  const base = process.env.PUBLIC_URL.replace(/\/$/, '');
  const wss = base.replace(/^http/, 'ws') + '/twilio/relay';
  const { ttsProvider, voice } = ttsFor(VOICE);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect action="${base}/twilio/relay-done?checkinId=${checkin._id}">`
    + `<ConversationRelay url="${wss}" welcomeGreeting="${xml(checkin.transcript[0].text)}" ttsProvider="${ttsProvider}" voice="${voice}" language="en-US" interruptible="true" hints="${HINTS}">`
    + `<Parameter name="checkinId" value="${checkin._id}"/>`
    + `</ConversationRelay></Connect></Response>`;
}

// Words she's likely to say, so the transcriber hears "headache", not "FedEx".
const HINTS = 'headache,dizzy,pills,blood pressure,vitamin D,doctor,heart doctor,appointment,ride,milk,groceries,pharmacy,refill,scam,gift cards,grandson,Anne,Mark,Maya,Dolores,Peggy,Porchlight';

// Dead-air guards for a live call.
const FILLER_MS = Number(process.env.RELAY_FILLER_MS || 2500);
const TURN_LIMIT_MS = Number(process.env.RELAY_TURN_LIMIT_MS || 12000);
const FILLERS = ['Mm, one moment.', 'Let me think.', 'Okay, just a second.'];

// Roughly how long Twilio needs to say a line, so "goodbye" isn't cut off before we hang up.
const speakMs = (text) => 1500 + text.split(/\s+/).length * 380;

function onConnection(ws) {
  let checkinId = null;
  let queue = Promise.resolve(); // one turn at a time, in order
  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  // One turn. Never leaves dead air: a short "one moment" if the first words are slow, and a
  // kind fallback (and the queue moves on) if the turn hasn't finished after TURN_LIMIT_MS.
  async function turn(said) {
    console.log(`[relay] she said: ${said}`);
    let spoke = false;
    let over = false;
    const say = (token, last, isFiller = false) => {
      if (over) return;
      if (!isFiller) spoke = spoke || Boolean(token.trim());
      send({ type: 'text', token, last });
    };
    const filler = setTimeout(() => { if (!spoke) say(FILLERS[Math.floor(Math.random() * FILLERS.length)] + ' ', false, true); }, FILLER_MS);
    let timer;
    const limit = new Promise((resolve) => { timer = setTimeout(() => resolve(null), TURN_LIMIT_MS); });
    try {
      // Each sentence is spoken as soon as Claude has written it (last: false), then closed out.
      const result = await Promise.race([
        addTurn(checkinId, said, { onSentence: (sentence) => say(`${sentence} `, false) }),
        limit,
      ]);
      if (!result) {
        console.warn(`[relay] turn took over ${TURN_LIMIT_MS} ms; moving on`);
        say(spoke ? '' : "Sorry, I'm a little slow just now. Could you say that again?", true);
        over = true;
        return;
      }
      const { reply, ended, transfer, streamed } = result;
      say(streamed ? '' : reply, true);
      over = true;
      // On "end", Twilio calls /twilio/relay-done with handoffData; a transfer there dials the family member.
      if (ended) setTimeout(() => send({ type: 'end', ...(transfer && { handoffData: JSON.stringify({ transfer }) }) }), speakMs(reply));
    } catch (e) {
      console.warn('[relay] turn failed:', e.message);
      say(spoke ? '' : 'Sorry, I lost my train of thought. Could you say that again?', true);
      over = true;
    } finally {
      clearTimeout(filler);
      clearTimeout(timer);
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'setup') {
      checkinId = msg.customParameters?.checkinId;
      console.log(`[relay] connected (check-in ${checkinId})`);
    } else if (msg.type === 'prompt' && msg.last !== false && checkinId) {
      const said = String(msg.voicePrompt || '').trim();
      if (!said) return;
      queue = queue.then(() => turn(said)).catch((e) => console.warn('[relay] turn failed:', e.message));
    } else if (msg.type === 'interrupt' && checkinId) {
      // She cut in: keep only what she actually heard, so the next reply doesn't assume the rest.
      const heard = String(msg.utteranceUntilInterrupt || '').trim();
      queue = queue.then(async () => {
        const c = await store.get('checkins', checkinId);
        const t = [...c.transcript];
        const i = t.map((x) => x.who).lastIndexOf('porchlight');
        if (i > 0 && heard && heard.length < t[i].text.length) {
          t[i] = { ...t[i], text: `${heard}…`, interrupted: true };
          await store.update('checkins', checkinId, { transcript: t });
        }
      }).catch(() => {});
    } else if (msg.type === 'error') {
      console.warn('[relay] Twilio error:', msg.description);
    }
  });
  ws.on('close', () => console.log(`[relay] closed (check-in ${checkinId})`));
}

export function attachRelay(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/twilio/relay')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, onConnection);
  });
}
