// OWNER: Person B (backend & workflows).
// Everything the family, volunteer and senior buttons use, plus the one-call state snapshot.
import { Router } from 'express';
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { llmEnabled } from '../voice/llm.js';
import { twilioEnabled, recentNotifications, tellSenior } from '../voice/notify.js';
import * as actions from './actions.js';
import * as audit from './audit.js';
import { buildDigest } from './digest.js';
import { syncCalendar } from './calendar.js';
import * as meds from './meds.js';
import { helpContext } from './help.js';
import { wrap } from '../wrap.js';
import { assertSenior, ownDoc, actingMember, seniorIdOf } from '../account/access.js';
import { canCall } from '../voice/schedule.js';
import { HttpError } from '../account/errors.js';

// Who did it, for the audit log and "who's helping": the family member, or 'senior' on the older adult's own phone.
const actor = (req) => req.account.memberId || 'senior';

export const careRoutes = Router();

// Everything the app needs in one call, for the signed-in account's own care circle only. The app polls
// this every few seconds. Family members with seesMeds:false get no meds, no transcripts, medStatus
// 'private', and sensitive task titles hidden.
careRoutes.get('/api/state', wrap(async (req, res) => {
  const account = req.account;
  const config = { llm: llmEnabled, twilio: twilioEnabled, mongo: store.usingMongo(), calls: canCall() };
  const me = { id: account._id, role: account.role, name: account.name, phone: account.phone, seniorId: account.seniorId || null, memberId: account.memberId || null };
  const senior = account.seniorId ? await store.get('seniors', account.seniorId) : null;
  if (!senior) {
    return res.json({ me, seniors: [], members: [], checkins: [], tasks: [], escalations: [], events: [], scamChecks: [], appointments: [], actions: [], notices: [], digest: { line: '', items: [] }, medsToday: [], notifications: [], config });
  }
  const mine = { seniorId: senior._id };
  let [members, checkins, tasks, escalations, events, scamChecks, appointments, actionList, notices, doses] = await Promise.all([
    store.list('members', { circleId: senior.circleId }),
    store.list('checkins', mine, { sort: { startedAt: -1 }, limit: 60 }),
    store.list('tasks', mine),
    store.list('escalations', mine, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('events', { circleId: senior.circleId }),
    store.list('scamChecks', mine, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('appointments', mine),
    store.list('actions', mine, { sort: { createdAt: -1 } }),
    store.list('notices', mine, { sort: { createdAt: -1 }, limit: 20 }),
    store.list('doses', mine),
  ]);
  let seniors = [senior];
  let medsToday = senior.meds?.length ? meds.dosesToday(senior, doses) : [];
  const viewer = account.memberId ? members.find((m) => m._id === account.memberId) : null;
  const digest = buildDigest({ senior, checkins, tasks, actions: actionList, escalations, viewer, medsToday });
  if (viewer && viewer.seesMeds === false) {
    const primary = members.find((m) => m.primary);
    seniors = seniors.map((s) => ({ ...s, meds: [] }));
    medsToday = [];
    checkins = checkins.map((c) => ({ ...c, transcript: [], medStatus: 'private', medsTaken: null, flags: (c.flags || []).filter((f) => f.type !== 'meds_unsure') }));
    tasks = tasks.map((t) => (t.sensitive ? { ...t, title: `Private task (${primary?.name.split(' ')[0] || 'the primary contact'} can see it)`, quote: null } : t));
    escalations = escalations.map((e) => (e.context?.meds ? { ...e, context: { ...e.context, meds: null } } : e));
  }
  // Push tokens and the account links are server-side details.
  const strip = ({ pushToken, accountId, ...rest }) => ({ ...rest, hasApp: Boolean(accountId) });
  const ids = new Set([senior._id, ...members.map((m) => m._id)]);
  res.json({
    me, seniors: seniors.map(strip), members: members.map(strip), checkins, tasks, escalations, events, scamChecks,
    appointments, actions: actionList, notices, digest, medsToday,
    notifications: recentNotifications().filter((n) => ids.has(n.toId)),
    config,
  });
}));

// Peggy's phone posts the next two weeks of her calendar (see care/calendar.js).
careRoutes.post('/api/seniors/:id/calendar', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  if (req.account.role !== 'senior') throw new HttpError(403, 'Only the older adult’s own phone shares its calendar.');
  res.json(await syncCalendar(req.params.id, req.body || {}));
}));

// ---------- Medications (care/meds.js) ----------
// Family members the primary contact hasn't given medicine access can't read or change them.
async function mustSeeMeds(req) {
  const m = await actingMember(req);
  if (m && m.seesMeds === false) throw new HttpError(403, 'Medicine details are private to the primary contact.');
}
// The list: Peggy or family add and edit { name, dose, times: ['08:00'] }.
careRoutes.post('/api/seniors/:id/meds', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  await mustSeeMeds(req);
  const med = await meds.addMed(req.params.id, req.body || {});
  await audit.log(actor(req), 'meds.add', { seniorId: req.params.id, targetId: med.id, detail: med.name });
  res.json(med);
}));
careRoutes.patch('/api/seniors/:id/meds/:medId', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  await mustSeeMeds(req);
  const med = await meds.editMed(req.params.id, req.params.medId, req.body || {});
  await audit.log(actor(req), 'meds.edit', { seniorId: req.params.id, targetId: med.id, detail: med.name });
  res.json(med);
}));
careRoutes.delete('/api/seniors/:id/meds/:medId', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  await mustSeeMeds(req);
  res.json(await meds.removeMed(req.params.id, req.params.medId));
}));
// A dose marked Taken (the reminder's button, Peggy's Today card, or family on her behalf); DELETE undoes it.
careRoutes.post('/api/seniors/:id/doses', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  await mustSeeMeds(req);
  res.json(await meds.markTaken(req.params.id, { ...req.body, by: actor(req) }));
}));
careRoutes.delete('/api/seniors/:id/doses', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  await mustSeeMeds(req);
  res.json(await meds.unmark(req.params.id, req.body || {}));
}));

// ---------- Senior buttons ----------
// { location?: { lat, lng, accuracy, address } } from the phone, when location is allowed.
careRoutes.post('/api/seniors/:id/help', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  const senior = await store.get('seniors', req.params.id);
  const context = await helpContext(senior, req.body?.location);
  await audit.log(actor(req), 'help.pressed', { seniorId: senior._id, detail: context.location ? 'with location' : 'no location' });
  res.json(await escalation.start(senior, 'help', context));
}));

// A family member takes the alert ("I'm on it").
careRoutes.post('/api/seniors/:id/help/ack', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  const member = await actingMember(req);
  if (!member) throw new HttpError(403, 'Only family members can take an alert.');
  res.json(await escalation.acknowledge(req.params.id, member));
}));

careRoutes.post('/api/seniors/:id/resolve', wrap(async (req, res) => {
  assertSenior(req, req.params.id);
  const member = await actingMember(req);
  const senior = await store.get('seniors', req.params.id);
  const n = await escalation.resolve(req.params.id, member?.name || senior.preferredName);
  await store.update('seniors', req.params.id, { status: 'ok' });
  res.json({ resolved: n });
}));

// ---------- Care tasks ----------
careRoutes.post('/api/tasks', wrap(async (req, res) => {
  const seniorId = seniorIdOf(req);
  const title = String(req.body?.title || '').trim().slice(0, 140);
  if (!title) throw new HttpError(400, 'Write the task first.');
  const type = ['errand', 'ride', 'groceries', 'repair', 'visit', 'call', 'meal', 'refill'].includes(req.body?.type) ? req.body.type : 'errand';
  const due = String(req.body?.due || 'This week').slice(0, 40);
  res.json(await store.insert('tasks', { seniorId, title, type, due, assignee: null, status: 'open', source: 'family', requestedBy: actor(req) }));
}));

// When someone takes a task Peggy asked for, she hears it (only once it's actually claimed).
async function noticeClaimed(task, memberId) {
  if (!['senior', 'peggy'].includes(task.requestedBy) || task.sensitive) return;
  const member = await store.get('members', memberId);
  const senior = await store.get('seniors', task.seniorId);
  if (!member || !senior) return;
  const first = member.name.split(' ')[0];
  const what = { groceries: /milk/i.test(task.title + (task.quote || '')) ? 'your milk' : 'your groceries', refill: 'your prescription refill' }[task.type];
  const when = task.due && !/this week/i.test(task.due) ? ` ${task.due}` : '';
  const text = what ? `${first} is bringing ${what}${when}.` : `${first} is taking care of "${task.title}"${when}.`;
  await store.insert('notices', { seniorId: senior._id, kind: 'task', text, at: new Date().toISOString(), taskId: task._id });
  await tellSenior(senior, text);
}

// Family-only task buttons: the acting member is always the signed-in account, never the request body.
async function familyTask(req) {
  const task = await ownDoc(req, 'tasks', req.params.id);
  if (!req.account.memberId) throw new HttpError(403, 'Only family members can take tasks.');
  req.body = { ...req.body, memberId: req.account.memberId };
  return task;
}

careRoutes.post('/api/tasks/:id/claim', wrap(async (req, res) => {
  await familyTask(req);
  const task = await store.update('tasks', req.params.id, { assignee: req.body.memberId, claimedAt: new Date().toISOString(), handoff: null });
  await audit.log(req.body.memberId, 'task.claim', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  await noticeClaimed(task, req.body.memberId);
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/handoff', wrap(async (req, res) => {
  const t0 = await familyTask(req);
  const from = req.body.memberId;
  const to = String(req.body.to || '');
  const target = await store.get('members', to);
  const senior = await store.get('seniors', t0.seniorId);
  if (!target || target.circleId !== senior.circleId) throw new HttpError(400, 'Pick someone in the circle.');
  const task = await store.update('tasks', req.params.id, { handoff: { from, to, status: 'pending', at: new Date().toISOString() } });
  await audit.log(from, 'task.handoff', { seniorId: task.seniorId, targetId: task._id, detail: `asked ${to}` });
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/accept', wrap(async (req, res) => {
  const t = await familyTask(req);
  const task = await store.update('tasks', req.params.id, {
    assignee: req.body.memberId, claimedAt: new Date().toISOString(),
    handoff: t.handoff ? { ...t.handoff, status: 'accepted' } : null,
  });
  await audit.log(req.body.memberId, 'task.accept', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  await noticeClaimed(task, req.body.memberId);
  res.json(task);
}));

careRoutes.post('/api/tasks/:id/decline', wrap(async (req, res) => {
  const t = await familyTask(req);
  const task = await store.update('tasks', req.params.id, { handoff: t.handoff ? { ...t.handoff, status: 'declined' } : null });
  await audit.log(req.body.memberId, 'task.decline', { seniorId: task.seniorId, targetId: task._id, detail: task.title });
  res.json(task);
}));

// ---------- Actions (rides) ----------
const act = (fn) => wrap(async (req, res) => {
  await ownDoc(req, 'actions', req.params.id);
  res.json(await fn(req.params.id, req.account.memberId));
});
careRoutes.post('/api/actions/:id/approve', act(actions.approve));
careRoutes.post('/api/actions/:id/reject', act(actions.reject));
careRoutes.post('/api/actions/:id/complete', act(actions.complete));

careRoutes.post('/api/tasks/:id/done', wrap(async (req, res) => {
  await ownDoc(req, 'tasks', req.params.id);
  res.json(await store.update('tasks', req.params.id, { status: 'done', doneAt: new Date().toISOString() }));
}));
