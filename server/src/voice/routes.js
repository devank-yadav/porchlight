// OWNER: Person A (voice & AI).
// Check-in API used by the app's Talk screen, the scam check, and Twilio phone webhooks.
import { Router } from 'express';
import * as store from '../store.js';
import { scamCheck } from './llm.js';
import { sms, placeCall, twilioEnabled } from './notify.js';
import { startCheckin, addTurn, finishCheckin } from './checkins.js';
import * as escalation from '../care/escalation.js';
import { wrap } from '../wrap.js';

export const voiceRoutes = Router();

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
  `<Gather input="speech" speechTimeout="auto" action="/twilio/turn?checkinId=${checkinId}" method="POST"><Say voice="Polly.Joanna">${xml(say)}</Say></Gather>` +
  `<Redirect method="POST">/twilio/turn?checkinId=${checkinId}&amp;silent=${silent + 1}</Redirect>`;

voiceRoutes.post('/api/seniors/:id/call', wrap(async (req, res) => {
  if (!twilioEnabled || !process.env.PUBLIC_URL) {
    return res.status(400).json({ error: 'Phone calls need TWILIO_* and PUBLIC_URL in .env. Use "Talk" in the app instead.' });
  }
  const senior = await store.get('seniors', req.params.id);
  const { checkin } = await startCheckin(senior._id, 'phone');
  const base = process.env.PUBLIC_URL.replace(/\/$/, '');
  await placeCall(senior.phone, `${base}/twilio/voice?checkinId=${checkin._id}`, `${base}/twilio/status?checkinId=${checkin._id}`);
  res.json(checkin);
}));

voiceRoutes.post('/twilio/voice', wrap(async (req, res) => {
  const checkin = await store.get('checkins', req.query.checkinId);
  res.type('text/xml').send(twiml(gather(checkin.transcript[0].text, checkin._id)));
}));

voiceRoutes.post('/twilio/turn', wrap(async (req, res) => {
  const id = req.query.checkinId;
  const said = req.body.SpeechResult;
  if (!said) {
    // Never loop forever on a silent line: two retries, then a kind goodbye.
    // (/twilio/status still finishes the check-in or starts the missed ladder.)
    const silent = Number(req.query.silent || 0);
    if (silent >= 3) return res.type('text/xml').send(twiml(`<Say voice="Polly.Joanna">I'm having trouble hearing you, so I'll say goodbye for now. If you need anything, press your help button. Take care.</Say><Hangup/>`));
    return res.type('text/xml').send(twiml(gather("Sorry, I didn't catch that. Could you say that again?", id, silent)));
  }
  const { reply: answer, ended } = await addTurn(id, said);
  if (ended) {
    finishCheckin(id).catch(console.error);
    return res.type('text/xml').send(twiml(`<Say voice="Polly.Joanna">${xml(answer)}</Say><Hangup/>`));
  }
  res.type('text/xml').send(twiml(gather(answer, id)));
}));

voiceRoutes.post('/twilio/status', wrap(async (req, res) => {
  const checkin = await store.get('checkins', req.query.checkinId);
  const answered = checkin.transcript.some((t) => t.who === 'senior');
  if (!answered && ['no-answer', 'busy', 'failed', 'completed'].includes(req.body.CallStatus)) {
    await store.update('checkins', checkin._id, { status: 'missed', endedAt: new Date().toISOString() });
    await escalation.start(await store.get('seniors', checkin.seniorId), 'missed');
  } else if (answered) {
    await finishCheckin(checkin._id);
  }
  res.sendStatus(204);
}));
