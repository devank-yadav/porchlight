import './env.js'; // must stay first
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import { seed } from './seed.js';
import { reply, analyze, scamCheck, greeting, llmEnabled } from './llm.js';
import * as escalation from './escalation.js';
import { sms, placeCall, twilioEnabled, recentNotifications } from './notify.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio webhooks

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});
const MAX_TURNS = 6;

// ---------- Read everything the UI needs in one call ----------
app.get('/api/state', wrap(async (_req, res) => {
  const [seniors, members, checkins, tasks, escalations, events, scamChecks] = await Promise.all([
    store.list('seniors'),
    store.list('members'),
    store.list('checkins', {}, { sort: { startedAt: -1 }, limit: 60 }),
    store.list('tasks'),
    store.list('escalations', {}, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('events'),
    store.list('scamChecks', {}, { sort: { createdAt: -1 }, limit: 20 }),
  ]);
  res.json({
    seniors, members, checkins, tasks, escalations, events, scamChecks,
    notifications: recentNotifications(),
    config: { llm: llmEnabled, twilio: twilioEnabled, mongo: Boolean(process.env.MONGODB_URI) },
  });
}));

// ---------- Check-in conversation (browser voice or phone) ----------
async function startCheckin(seniorId, channel) {
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw new Error('Senior not found');
  const text = greeting(senior, senior.opener);
  const checkin = await store.insert('checkins', {
    seniorId, channel, status: 'in-progress', startedAt: new Date().toISOString(),
    transcript: [{ who: 'porchlight', text, at: new Date().toISOString() }],
  });
  await store.update('seniors', seniorId, { status: 'talking' });
  return { senior, checkin };
}

async function addTurn(checkinId, text) {
  const checkin = await store.get('checkins', checkinId);
  const senior = await store.get('seniors', checkin.seniorId);
  const transcript = [...checkin.transcript, { who: 'senior', text, at: new Date().toISOString() }];
  const answer = await reply(senior, transcript);
  transcript.push({ who: 'porchlight', text: answer, at: new Date().toISOString() });
  await store.update('checkins', checkinId, { transcript });
  const turns = transcript.filter((t) => t.who === 'senior').length;
  return { reply: answer, ended: turns >= MAX_TURNS };
}

async function finishCheckin(checkinId) {
  const checkin = await store.get('checkins', checkinId);
  if (checkin.status === 'completed') return checkin;
  const senior = await store.get('seniors', checkin.seniorId);
  const a = await analyze(senior, checkin.transcript);

  const urgent = a.flags.some((f) => f.type === 'urgent');
  const scam = a.flags.some((f) => f.type === 'scam');
  const updated = await store.update('checkins', checkinId, {
    ...a, status: 'completed', endedAt: new Date().toISOString(),
  });

  for (const r of a.requests) {
    await store.insert('tasks', {
      seniorId: senior._id, title: r.title, type: r.type, due: r.when || 'This week',
      assignee: null, status: 'open', source: 'checkin', checkinId,
    });
  }

  const status = urgent ? 'help' : scam ? 'scam' : a.flags.length ? 'needs-human' : 'ok';
  await store.update('seniors', senior._id, { status, lastNote: a.summary, lastCheckinAt: updated.endedAt });
  await escalation.resolve(senior._id, 'Check-in completed');

  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const family = members.filter((m) => m.role === 'family');
  if (urgent) await escalation.start(senior, 'help');
  else if (scam) for (const m of family) await sms(m, `${senior.preferredName} mentioned a call that sounds like a scam: "${a.flags.find((f) => f.type === 'scam').text}". Worth a call today.`);
  return updated;
}

app.post('/api/checkins', wrap(async (req, res) => {
  const { checkin } = await startCheckin(req.body.seniorId, req.body.channel || 'app');
  res.json(checkin);
}));

app.post('/api/checkins/:id/message', wrap(async (req, res) => {
  res.json(await addTurn(req.params.id, String(req.body.text || '').slice(0, 1000)));
}));

app.post('/api/checkins/:id/finish', wrap(async (req, res) => {
  res.json(await finishCheckin(req.params.id));
}));

// ---------- Senior buttons ----------
app.post('/api/seniors/:id/ok', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  await store.insert('checkins', {
    seniorId: senior._id, channel: 'button', status: 'completed',
    startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    transcript: [], summary: `${senior.preferredName} tapped "I'm okay".`, mood: 'okay',
    medsTaken: null, flags: [], starters: [], stories: [], requests: [],
  });
  await store.update('seniors', senior._id, { status: 'ok', lastCheckinAt: new Date().toISOString() });
  const n = await escalation.resolve(senior._id, `${senior.preferredName} herself`);
  res.json({ ok: true, resolved: n });
}));

app.post('/api/seniors/:id/help', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  res.json(await escalation.start(senior, 'help'));
}));

// Demo control: pretend she didn't answer today's call.
app.post('/api/seniors/:id/missed', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  res.json(await escalation.start(senior, 'missed'));
}));

app.post('/api/seniors/:id/resolve', wrap(async (req, res) => {
  const member = req.body.memberId ? await store.get('members', req.body.memberId) : null;
  const n = await escalation.resolve(req.params.id, member?.name || 'Someone in the circle');
  await store.update('seniors', req.params.id, { status: 'ok' });
  res.json({ resolved: n });
}));

// ---------- Scam check ----------
app.post('/api/scam-check', wrap(async (req, res) => {
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

// ---------- Care tasks ----------
app.post('/api/tasks', wrap(async (req, res) => {
  const { seniorId, title, type = 'errand', due = 'This week' } = req.body;
  res.json(await store.insert('tasks', { seniorId, title, type, due, assignee: null, status: 'open', source: 'family' }));
}));

app.post('/api/tasks/:id/claim', wrap(async (req, res) => {
  res.json(await store.update('tasks', req.params.id, { assignee: req.body.memberId, claimedAt: new Date().toISOString() }));
}));

app.post('/api/tasks/:id/done', wrap(async (req, res) => {
  res.json(await store.update('tasks', req.params.id, { status: 'done', doneAt: new Date().toISOString() }));
}));

app.post('/api/demo/reset', wrap(async (_req, res) => {
  await seed();
  res.json({ ok: true });
}));

// ---------- Real phone calls (optional, needs Twilio + a public URL) ----------
const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const gather = (say, checkinId) =>
  `<Gather input="speech" speechTimeout="auto" action="/twilio/turn?checkinId=${checkinId}" method="POST"><Say voice="Polly.Joanna">${xml(say)}</Say></Gather>` +
  `<Redirect method="POST">/twilio/turn?checkinId=${checkinId}&amp;silent=1</Redirect>`;

app.post('/api/seniors/:id/call', wrap(async (req, res) => {
  if (!twilioEnabled || !process.env.PUBLIC_URL) {
    return res.status(400).json({ error: 'Phone calls need TWILIO_* and PUBLIC_URL in .env. Use "Talk" in the app instead.' });
  }
  const senior = await store.get('seniors', req.params.id);
  const { checkin } = await startCheckin(senior._id, 'phone');
  const base = process.env.PUBLIC_URL.replace(/\/$/, '');
  await placeCall(senior.phone, `${base}/twilio/voice?checkinId=${checkin._id}`, `${base}/twilio/status?checkinId=${checkin._id}`);
  res.json(checkin);
}));

app.post('/twilio/voice', wrap(async (req, res) => {
  const checkin = await store.get('checkins', req.query.checkinId);
  res.type('text/xml').send(twiml(gather(checkin.transcript[0].text, checkin._id)));
}));

app.post('/twilio/turn', wrap(async (req, res) => {
  const id = req.query.checkinId;
  const said = req.body.SpeechResult;
  if (!said) {
    return res.type('text/xml').send(twiml(gather("Sorry, I didn't catch that. How are you doing today?", id)));
  }
  const { reply: answer, ended } = await addTurn(id, said);
  if (ended) {
    finishCheckin(id).catch(console.error);
    return res.type('text/xml').send(twiml(`<Say voice="Polly.Joanna">${xml(answer)}</Say><Hangup/>`));
  }
  res.type('text/xml').send(twiml(gather(answer, id)));
}));

app.post('/twilio/status', wrap(async (req, res) => {
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

// ---------- Serve the built client in production ----------
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|twilio).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT || 3001);
await store.connect();
const existing = await store.list('seniors');
if (!existing.length || process.env.RESEED === '1') await seed();
app.listen(PORT, () => {
  console.log(`[porchlight] API on http://localhost:${PORT}  (LLM: ${llmEnabled ? 'on' : 'mock'}, Twilio: ${twilioEnabled ? 'on' : 'off'})`);
});
