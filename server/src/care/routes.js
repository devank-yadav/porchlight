// OWNER: Person B (backend & workflows).
// Everything the family, volunteer and senior buttons use, plus the one-call state snapshot.
import { Router } from 'express';
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { seed } from './seed.js';
import { llmEnabled } from '../voice/llm.js';
import { twilioEnabled, recentNotifications } from '../voice/notify.js';
import { wrap } from '../wrap.js';

export const careRoutes = Router();

// Everything the app needs in one call. The app polls this every 2 seconds.
careRoutes.get('/api/state', wrap(async (_req, res) => {
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

// ---------- Senior buttons ----------
careRoutes.post('/api/seniors/:id/ok', wrap(async (req, res) => {
  const senior = await store.get('seniors', req.params.id);
  const now = new Date().toISOString();
  await store.insert('checkins', {
    seniorId: senior._id, channel: 'button', status: 'completed', startedAt: now, endedAt: now,
    transcript: [], summary: `${senior.preferredName} tapped "I'm okay".`, mood: 'okay',
    medsTaken: null, flags: [], starters: [], stories: [], requests: [],
  });
  await store.update('seniors', senior._id, { status: 'ok', lastCheckinAt: now });
  const n = await escalation.resolve(senior._id, `${senior.preferredName} herself`);
  res.json({ ok: true, resolved: n });
}));

careRoutes.post('/api/seniors/:id/help', wrap(async (req, res) => {
  res.json(await escalation.start(await store.get('seniors', req.params.id), 'help'));
}));

// Demo control: pretend she didn't answer today's call.
careRoutes.post('/api/seniors/:id/missed', wrap(async (req, res) => {
  res.json(await escalation.start(await store.get('seniors', req.params.id), 'missed'));
}));

careRoutes.post('/api/seniors/:id/resolve', wrap(async (req, res) => {
  const member = req.body.memberId ? await store.get('members', req.body.memberId) : null;
  const n = await escalation.resolve(req.params.id, member?.name || 'Someone in the circle');
  await store.update('seniors', req.params.id, { status: 'ok' });
  res.json({ resolved: n });
}));

// ---------- Care tasks ----------
careRoutes.post('/api/tasks', wrap(async (req, res) => {
  const { seniorId, title, type = 'errand', due = 'This week' } = req.body;
  res.json(await store.insert('tasks', { seniorId, title, type, due, assignee: null, status: 'open', source: 'family' }));
}));

careRoutes.post('/api/tasks/:id/claim', wrap(async (req, res) => {
  res.json(await store.update('tasks', req.params.id, { assignee: req.body.memberId, claimedAt: new Date().toISOString() }));
}));

careRoutes.post('/api/tasks/:id/done', wrap(async (req, res) => {
  res.json(await store.update('tasks', req.params.id, { status: 'done', doneAt: new Date().toISOString() }));
}));

careRoutes.post('/api/demo/reset', wrap(async (_req, res) => {
  await seed();
  res.json({ ok: true });
}));
