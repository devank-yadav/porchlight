// OWNER: Person A (voice & AI).
// Check-in API used by the app's Talk screen, the scam check, and Twilio phone webhooks.
import { Router } from 'express';
import * as store from '../store.js';
import { scamCheck } from './llm.js';
import { sms, VOICE } from './notify.js';
import { callSenior, setSchedule, scheduleOf, startScheduler, scheduleRetry } from './schedule.js';
import { relayEnabled, relayTwiml } from './relay.js';
import { transcribeRecording } from './stt.js';
import { startCheckin, addTurn, finishCheckin } from './checkins.js';
import * as escalation from '../care/escalation.js';
import { wrap } from '../wrap.js';

export const voiceRoutes = Router();

// ---------- Demo: play the scripted call (DEMO.md lines) without a phone ----------
export const DEMO_LINES = [
  "I'm good. A man called about gift cards, I hung up",
  "I don't have a ride to the heart doctor tomorrow",
  "And I'm out of milk",
  "No, that's all",
];
voiceRoutes.post('/api/demo/call', wrap(async (req, res) => {
  const { checkin } = await startCheckin(req.body.seniorId || 'peggy', 'app');
  for (const line of DEMO_LINES) {
    const { ended } = await addTurn(checkin._id, line);
    if (ended) break;
  }
  res.json(await finishCheckin(checkin._id));
}));

// ---------- In-app check-in ----------
voiceRoutes.post('/api/checkins', wrap(async (req, res) => {
  const { checkin } = await startCheckin(req.body.seniorId, req.body.channel || 'app');
  res.json(checkin);
}));

voiceRoutes.post('/api/checkins/:id/message', wrap(async (req, res) => {
  res.json(await addTurn(req.params.id, String(req.body.text || '').slice(0, 1000)));
}));

voiceRoutes.post('/api/checkins/:id/finish', wrap(async (req, res) => {
  res.json(await finishCheckin(req.params.id));
}));

// ---------- Scam check ----------
voiceRoutes.post('/api/scam-check', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.body.seniorId);
  const description = String(req.body.text || '').slice(0, 2000);
  const result = await scamCheck(description);
  const saved = await store.insert('scamChecks', { seniorId: senior._id, description, ...result });
  if (result.verdict !== 'probably fine' && senior.circleId) {
    const family = (await store.list('members', { circleId: senior.circleId })).filter((m) => m.role === 'family');
    for (const m of family) await sms(m, `${senior.preferredName} asked about a suspicious contact (${result.verdict}): "${description.slice(0, 120)}"`);
  }
  res.json(saved);
}));

// ---------- Real phone calls (Twilio + a public URL) ----------
const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const gather = (say, checkinId, silent = 0) =>
  `<Gather input="speech" language="en-US" speechTimeout="2" timeout="6" action="/twilio/turn?checkinId=${checkinId}" method="POST"><Say voice="${VOICE}">${xml(say)}</Say></Gather>` +
  `<Redirect method="POST">/twilio/turn?checkinId=${checkinId}&amp;silent=${silent + 1}</Redirect>`;
// VOICE_MODE=record: Twilio records her reply and we transcribe it ourselves (works on Twilio trial
// accounts, which block <Gather input="speech">). Silence ends her turn after 2 seconds.
const recordMode = () => process.env.VOICE_MODE === 'record';
const listen = (say, checkinId, silent = 0) =>
  `<Say voice="${VOICE}">${xml(say)}</Say>`
  + `<Record action="/twilio/heard?checkinId=${checkinId}&amp;silent=${silent}" method="POST" timeout="2" maxLength="30" playBeep="false" trim="trim-silence"/>`
  + `<Redirect method="POST">/twilio/heard?checkinId=${checkinId}&amp;silent=${silent + 1}</Redirect>`;
const ask = (say, checkinId, silent = 0) => (recordMode() ? listen(say, checkinId, silent) : gather(say, checkinId, silent));

// "Call now" in the app.
voiceRoutes.post('/api/seniors/:id/call', wrap(async (req, res) => {
  res.json(await callSenior(req.params.id, 'now'));
}));

// Daily call schedule: { autoCall, checkinTime: "HH:MM", callDays: [0-6] }.
voiceRoutes.get('/api/seniors/:id/schedule', wrap(async (req, res) => {
  res.json(scheduleOf(await store.get('seniors', req.params.id)));
}));
// Family questions: "Ask Mom about her first job". Porchlight asks one on a coming call, and her answer
// is saved as a story under it. { text, memberId } → the senior's open questions.
voiceRoutes.post('/api/seniors/:id/questions', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'Write a question first.' });
  const q = { _id: `q${Date.now().toString(36)}`, text, askedBy: req.body.memberId || null, askedAt: new Date().toISOString() };
  const updated = await store.update('seniors', senior._id, { familyQuestions: [...(senior.familyQuestions || []), q] });
  res.json(updated.familyQuestions);
}));
voiceRoutes.delete('/api/seniors/:id/questions/:qid', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  const updated = await store.update('seniors', senior._id, { familyQuestions: (senior.familyQuestions || []).filter((q) => q._id !== req.params.qid) });
  res.json(updated.familyQuestions);
}));

voiceRoutes.put('/api/seniors/:id/schedule', wrap(async (req, res) => {
  res.json(scheduleOf(await setSchedule(req.params.id, req.body || {})));
}));
startScheduler();

voiceRoutes.post('/twilio/voice', wrap(async (req, res) => {
  const checkin = await store.get('checkins', req.query.checkinId);
  if (relayEnabled()) return res.type('text/xml').send(relayTwiml(checkin)); // natural, streaming conversation
  res.type('text/xml').send(twiml(ask(checkin.transcript[0].text, checkin._id)));
}));

// ConversationRelay finished (we sent "end", or the line dropped): hang up kindly.
voiceRoutes.post('/twilio/relay-done', (req, res) => {
  if (req.body.ErrorCode || req.body.ErrorMessage) console.warn('[relay] ended with error:', req.body.ErrorCode, req.body.ErrorMessage);
  let transfer = null;
  try { transfer = JSON.parse(req.body.HandoffData || '{}').transfer; } catch {}
  res.type('text/xml').send(twiml(transfer ? dialTo(transfer) : '<Hangup/>'));
});

// "Put me through to Anne": bridge her call to the family member's phone.
const dialTo = (phone) => `<Dial callerId="${xml(process.env.TWILIO_FROM_NUMBER || '')}" timeout="25" action="/twilio/dial-done" method="POST">${xml(phone)}</Dial>`;
voiceRoutes.post('/twilio/dial-done', (req, res) => {
  const reached = req.body.DialCallStatus === 'completed';
  res.type('text/xml').send(twiml(reached ? '<Hangup/>'
    : `<Say voice="${VOICE}">I couldn't reach them just now, but they have a text from me asking them to call you back. Take care.</Say><Hangup/>`));
});

// One turn of the phone conversation: what she said → Porchlight's reply (or a kind goodbye).
async function respond(res, id, said, silent) {
  if (!said) {
    // Never loop forever on a silent line: two retries, then a kind goodbye.
    // (/twilio/status still finishes the check-in or starts the missed ladder.)
    if (silent >= 3) return res.type('text/xml').send(twiml(`<Say voice="${VOICE}">I'm having trouble hearing you, so I'll say goodbye for now. If you need anything, press your help button. Take care.</Say><Hangup/>`));
    return res.type('text/xml').send(twiml(ask("Sorry, I didn't catch that. Could you say that again?", id, silent)));
  }
  const { reply: answer, ended, transfer } = await addTurn(id, said);
  if (ended) {
    finishCheckin(id).catch(console.error);
    return res.type('text/xml').send(twiml(`<Say voice="${VOICE}">${xml(answer)}</Say>${transfer ? dialTo(transfer) : '<Hangup/>'}`));
  }
  res.type('text/xml').send(twiml(ask(answer, id)));
}

// <Gather> mode: Twilio already turned her speech into text.
voiceRoutes.post('/twilio/turn', wrap(async (req, res) => {
  await respond(res, req.query.checkinId, req.body.SpeechResult, Number(req.query.silent || 0));
}));

// Record mode: transcribe her recording with local Whisper.
voiceRoutes.post('/twilio/heard', wrap(async (req, res) => {
  let said = '';
  if (req.body.RecordingUrl && Number(req.body.RecordingDuration || 0) > 0) {
    try {
      said = (await transcribeRecording(req.body.RecordingUrl)).trim();
      console.log(`[stt] she said: ${said || '(nothing)'}`);
    } catch (e) {
      console.warn('[stt] transcription failed:', e.message);
    }
  }
  await respond(res, req.query.checkinId, said, Number(req.query.silent || 0) + (said ? 0 : 1));
}));

voiceRoutes.post('/twilio/status', wrap(async (req, res) => {
  const checkin = await store.get('checkins', req.query.checkinId);
  const answered = checkin.transcript.some((t) => t.who === 'senior');
  if (!answered && ['no-answer', 'busy', 'failed', 'completed'].includes(req.body.CallStatus)) {
    const escalate = async () => escalation.start(await store.get('seniors', checkin.seniorId), 'missed');
    const retrying = scheduleRetry(checkin, escalate);
    await store.update('checkins', checkin._id, { status: 'missed', endedAt: new Date().toISOString(), ...(retrying ? { retrying: true } : {}) });
    if (!retrying) await escalate();
  } else if (answered) {
    await finishCheckin(checkin._id);
  }
  res.sendStatus(204);
}));
