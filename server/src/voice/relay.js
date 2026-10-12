// OWNER: Person A (voice & AI).
// Natural phone conversation through Twilio ConversationRelay: Twilio streams her speech to
// us as text over a WebSocket and speaks our replies with a natural voice. She can interrupt,
// and there's no "beep, now talk" turn-taking. Needs VOICE_MODE=relay and a paid Twilio account with the AI/ML addendum on.
import { WebSocketServer } from 'ws';
import * as store from '../store.js';
import { addTurn } from './checkins.js';
import { endInboundCall } from './inbound.js';

export const relayEnabled = () => process.env.VOICE_MODE === 'relay';

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// Live-call voice. ElevenLabs sounds the most human (billed through Twilio, no extra account).
// To go back to Google: RELAY_VOICE=Google.en-US-Chirp3-HD-Aoede in .env.
const RELAY_VOICE = process.env.RELAY_VOICE || 'ElevenLabs.21m00Tcm4TlvDq8ikWAM'; // "Rachel": calm, warm, clear

// "Google.en-US-Chirp3-HD-Aoede" → Google + en-US-Chirp3-HD-Aoede; "Polly.Joanna-Neural" → Amazon + Joanna-Neural.
function ttsFor(voice) {
  const [provider, ...rest] = voice.split('.');
  const name = rest.join('.');
  if (provider === 'Google') return { ttsProvider: 'Google', voice: name };
  if (provider === 'Polly') return { ttsProvider: 'Amazon', voice: name.replace(/-(Neural|Generative)$/, '') };
  if (provider === 'ElevenLabs') return { ttsProvider: 'ElevenLabs', voice: name }; // e.g. ElevenLabs.UgBBYS2sOqTuMpoF3BR0
  return { ttsProvider: 'Google', voice: 'en-US-Chirp3-HD-Aoede' };
}

export function relayTwiml(checkin, names = []) {
  const base = process.env.PUBLIC_URL.replace(/\/$/, '');
  const wss = base.replace(/^http/, 'ws') + '/twilio/relay';
  const { ttsProvider, voice } = ttsFor(RELAY_VOICE);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect action="${base}/twilio/relay-done?checkinId=${checkin._id}">`
    + `<ConversationRelay url="${wss}" welcomeGreeting="${xml(checkin.transcript[0].text)}" ttsProvider="${ttsProvider}" voice="${voice}" language="en-US" interruptible="true" hints="${xml([HINTS, ...names].join(','))}">`
    + `<Parameter name="checkinId" value="${checkin._id}"/>`
    + `</ConversationRelay></Connect></Response>`;
}

// Words she's likely to say, so the transcriber hears "headache", not "FedEx".
// Her circle's first names are added per call.
const HINTS = 'headache,dizzy,pills,blood pressure,doctor,heart doctor,appointment,ride,milk,groceries,pharmacy,refill,scam,gift cards,grandson,granddaughter,Porchlight';

// Roughly how long Twilio needs to say a line, so "goodbye" isn't cut off before we hang up.
const speakMs = (text) => 1500 + text.split(/\s+/).length * 380;

// Never leave her in silence or stuck:
// - a turn that takes too long gets a short "Mm, let me think" so she knows Porchlight heard her;
// - a turn that hangs is abandoned after TURN_LIMIT_MS with a kind line, and the call goes on;
// - if she keeps talking while Porchlight is still thinking, those words are folded into the next turn
//   instead of being answered one by one after a delay.
const FILLER_AFTER_MS = 1600;
const TURN_LIMIT_MS = 12000;
const FILLERS = ['Mm, let me think.', 'Okay, one moment.', 'Mm-hmm, let me see.'];

function onConnection(ws) {
  let checkinId = null;
  let busy = false;
  let pending = []; // what she said while a turn was running
  let fillerIndex = 0;
  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  async function runTurn(said) {
    busy = true;
    let spoke = false;
    let finished = false;
    console.log(`[relay] she said: ${said}`);
    const filler = setTimeout(() => {
      if (!spoke && !finished) { spoke = true; send({ type: 'text', token: `${FILLERS[fillerIndex++ % FILLERS.length]} `, last: false }); }
    }, FILLER_AFTER_MS);
    try {
      const turn = addTurn(checkinId, said, {
        // Each sentence is spoken as soon as Claude has written it (last: false), then closed out.
        onSentence: (sentence) => { if (finished) return; spoke = true; send({ type: 'text', token: `${sentence} `, last: false }); },
      });
      const out = await Promise.race([turn, new Promise((_, no) => setTimeout(() => no(new Error('turn timed out')), TURN_LIMIT_MS))]);
      finished = true;
      const { reply, ended, transfer, streamed } = out;
      send({ type: 'text', token: streamed ? '' : reply, last: true });
      // On "end", Twilio calls /twilio/relay-done with handoffData; a transfer there dials the family member.
      if (ended) setTimeout(() => send({ type: 'end', ...(transfer && { handoffData: JSON.stringify({ transfer }) }) }), speakMs(reply));
    } catch (e) {
      finished = true;
      console.warn('[relay] turn failed:', e.message);
      send({ type: 'text', token: "Sorry, I didn't quite get that. Could you say it again?", last: true });
    } finally {
      clearTimeout(filler);
      busy = false;
      if (pending.length) { const next = pending.join(' '); pending = []; runTurn(next); }
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
      if (busy) pending.push(said); else runTurn(said);
    } else if (msg.type === 'interrupt' && checkinId) {
      // She cut in: keep only what she actually heard, so the next reply doesn't assume the rest.
      const heard = String(msg.utteranceUntilInterrupt || '').trim();
      (async () => {
        const c = await store.get('checkins', checkinId);
        const t = [...c.transcript];
        const i = t.map((x) => x.who).lastIndexOf('porchlight');
        if (i > 0 && heard && heard.length < t[i].text.length) {
          t[i] = { ...t[i], text: `${heard}…`, interrupted: true };
          await store.update('checkins', checkinId, { transcript: t });
        }
      })().catch(() => {});
    } else if (msg.type === 'error') {
      console.warn('[relay] Twilio error:', msg.description);
    }
  });
  ws.on('close', () => {
    console.log(`[relay] closed (check-in ${checkinId})`);
    // A call she made in has no daily-call status webhook behind it: save it now (no-op for daily calls).
    // Waits a moment so a turn still being written lands in the transcript first.
    setTimeout(() => endInboundCall(checkinId).catch(console.error), busy ? TURN_LIMIT_MS : 500);
  });
}

export function attachRelay(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/twilio/relay')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, onConnection);
  });
}
