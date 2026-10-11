// OWNER: Person B (backend & workflows).
// Everything the family, volunteer and senior buttons use, plus the one-call state snapshot.
import { Router } from 'express';
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { seed } from './seed.js';
import { llmEnabled } from '../voice/llm.js';
import { twilioEnabled, recentNotifications, tellSenior } from '../voice/notify.js';
import * as actions from './actions.js';
import * as audit from './audit.js';
import { buildDigest } from './digest.js';
import { wrap } from '../wrap.js';

export const careRoutes = Router();

// Everything the app needs in one call. The app polls this every 2 seconds.
// ?viewer=<memberId>: a demo identity switch (not real login). Members with seesMeds:false
// get no meds, no transcripts, medStatus 'private', and sensitive task titles hidden.
careRoutes.get('/api/state', wrap(async (req, res) => {
  let [seniors, members, checkins, tasks, escalations, events, scamChecks, appointments, actionList, notices] = await Promise.all([
    store.list('seniors'),
    store.list('members'),
    store.list('checkins', {}, { sort: { startedAt: -1 }, limit: 60 }),
    store.list('tasks'),
    store.list('escalations', {}, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('events'),
    store.list('scamChecks', {}, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('appointments'),
    store.list('actions', {}, { sort: { createdAt: -1 } }),
    store.list('notices', {}, { sort: { createdAt: -1 }, limit: 20 }),
  ]);
  const viewer = req.query.viewer ? members.find((m) => m._id === req.query.viewer) : null;
  const digest = buildDigest({ senior: seniors.find((s) => s._id === 'peggy') || seniors[0], checkins, tasks, actions: actionList, escalations, viewer });
  if (viewer && viewer.seesMeds === false) {
    const primary = members.find((m) => m.primary);
    seniors = seniors.map((s) => ({ ...s, meds: [] }));
    checkins = checkins.map((c) => ({ ...c, transcript: [], medStatus: 'private', medsTaken: null, flags: (c.flags || []).filter((f) => f.type !== 'meds_unsure') }));
    tasks = tasks.map((t) => (t.sensitive ? { ...t, title: `Private task (${primary?.name.split(' ')[0] || 'the primary caregiver'} can see it)`, quote: null } : t));
  }
  res.json({
    seniors, members, checkins, tasks, escalations, events, scamChecks,
    appointments, actions: actionList, notices, digest,
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
    medsTaken: null, medStatus: 'no_answer', flags: [], starters: [], stories: [], requests: [],
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

// When someone takes a task Peggy asked for, she hears it (only once it's actually claimed).
async function noticeClaimed(task, memberId) {
  if (task.requestedBy !== 'peggy' || task.sensitive) return;
  const member = await store.get('members', memberId);
  const senior = await store.get('seniors', task.seniorId);
  if (!member || !senior) return;
  const first = member.name.split(' ')[0];
  const what = { groceries: /milk/i.test(task.title + (task.quote || '')) ? 'your milk' : 'your groceries', refill: 'your prescription refill' }[task.type];
  const when = task.due && !/this week/i.test(task.due) ? ` ${task.due}` : '';
  const text = what ? `${first} is bringing ${what}${when}.` : `${first} is taking care of "${task.title}"${when}.`;
  await store.insert('notices', { seniorId: senior._id, kind: 'task', text, at: new Date().toISOString(), simulated: false, taskId: task._id });
  await tellSenior(senior, text);
}

careRoutes.post('/api/tasks/:id/claim', wrap(async (req, res) => {
  const task = await store.update('tasks', req.params.id, { assignee: req.body.memberId, claimedAt: new Date().toISOString(), handoff: null });
  await audit.log(req.body.memberId, 'task.claim', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  await noticeClaimed(task, req.body.memberId);
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/handoff', wrap(async (req, res) => {
  const { from, to } = req.body;
  const task = await store.update('tasks', req.params.id, { handoff: { from, to, status: 'pending', at: new Date().toISOString() } });
  await audit.log(from, 'task.handoff', { seniorId: task.seniorId, targetId: task._id, detail: `asked ${to}` });
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/accept', wrap(async (req, res) => {
  const t = await store.get('tasks', req.params.id);
  const task = await store.update('tasks', req.params.id, {
    assignee: req.body.memberId, claimedAt: new Date().toISOString(),
    handoff: t.handoff ? { ...t.handoff, status: 'accepted' } : null,
  });
  await audit.log(req.body.memberId, 'task.accept', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  await noticeClaimed(task, req.body.memberId);
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/decline', wrap(async (req, res) => {
  const t = await store.get('tasks', req.params.id);
  const task = await store.update('tasks', req.params.id, { handoff: t.handoff ? { ...t.handoff, status: 'declined' } : null });
  await audit.log(req.body.memberId, 'task.decline', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  res.json(task);
}));

// ---------- Actions (rides). Simulated bookings only. ----------
careRoutes.post('/api/actions/:id/approve', wrap(async (req, res) => res.json(await actions.approve(req.params.id, req.body.memberId))));
careRoutes.post('/api/actions/:id/reject', wrap(async (req, res) => res.json(await actions.reject(req.params.id, req.body.memberId))));
careRoutes.post('/api/actions/:id/complete', wrap(async (req, res) => res.json(await actions.complete(req.params.id, req.body.memberId))));

careRoutes.post('/api/tasks/:id/done', wrap(async (req, res) => {
  res.json(await store.update('tasks', req.params.id, { status: 'done', doneAt: new Date().toISOString() }));
}));

careRoutes.post('/api/demo/reset', wrap(async (_req, res) => {
  await seed();
  res.json({ ok: true });
}));
