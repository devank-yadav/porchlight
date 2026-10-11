// B1 HTTP smoke check. Run against a fresh demo server; it presses OK and resets it.
// node server/src/care/contract.smoke.js [http://localhost:3001]
import assert from 'node:assert/strict';

const base = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
async function call(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(5000),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, `${method} ${path}`);
  return response.json();
}

const state = await call('/api/state');
for (const key of ['seniors', 'members', 'checkins', 'tasks', 'escalations', 'events', 'scamChecks', 'notifications', 'appointments', 'actions', 'notices']) {
  assert.ok(Array.isArray(state[key]), `${key} is an array`);
}
assert.equal(typeof state.digest.line, 'string');
assert.ok(Array.isArray(state.digest.items));

const anne = state.members.find((m) => m._id === 'anne');
assert.equal(anne.canApprove, true);
assert.equal(anne.seesMeds, true);
for (const id of ['mark', 'dolores', 'sam']) {
  const member = state.members.find((m) => m._id === id);
  assert.equal(member.canApprove, false, `${id} cannot approve`);
  assert.equal(member.seesMeds, false, `${id} cannot see medication details`);
}

const appointment = state.appointments.find((a) => a.seniorId === 'peggy');
assert.equal(appointment.transport, 'unknown');
assert.equal(appointment.actionId, null);
assert.match(appointment.with, /\(sample\)/);
assert.match(appointment.where, /\(sample\)/);
const dateParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
const today = dateParts(new Date());
const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
const at = dateParts(new Date(appointment.startsAt));
assert.equal(at.year, tomorrow.getUTCFullYear());
assert.equal(at.month, tomorrow.getUTCMonth() + 1);
assert.equal(at.day, tomorrow.getUTCDate());
assert.equal(at.hour, 14, 'appointment is at 2 PM in Peggy’s time zone');
assert.equal(at.minute, 0);
assert.equal(state.actions.length, 0, 'a fresh demo has no invented ride booking');

for (const task of state.tasks) {
  assert.ok(task.quote === null || typeof task.quote === 'string');
  assert.ok(task.requestedBy === 'peggy' || state.members.some((m) => m._id === task.requestedBy));
  assert.ok(state.members.some((m) => m._id === task.suggestedOwner));
  assert.equal(task.handoff, null);
  assert.equal(typeof task.sensitive, 'boolean');
}
for (const checkin of state.checkins) {
  assert.ok(['taken', 'not_taken', 'unsure', 'no_answer'].includes(checkin.medStatus));
  assert.ok(Object.hasOwn(checkin, 'medsTaken'), 'legacy medication field remains available');
}
const notice = state.notices.find((n) => n.seniorId === 'peggy');
assert.equal(notice.kind, 'task');
assert.equal(notice.simulated, true);
assert.ok(Number.isFinite(Date.parse(notice.at)));
assert.ok(state.tasks.some((t) => t.type === 'repair' && t.assignee === 'mark'));
assert.match(notice.text, /Mark.*porch step/);

// Exercise the merged A → B interface with B1's actual seed context.
const talk = await call('/api/checkins', 'POST', { seniorId: 'peggy', channel: 'app' });
assert.match(talk.transcript[0].text, /Mark.*porch step/, 'voice reads the confirmed sample notice');
const quote = "I don't have a ride to the heart doctor tomorrow.";
const answer = await call(`/api/checkins/${talk._id}/message`, 'POST', { text: quote });
assert.match(answer.reply, /Anne/, 'voice asks the primary caregiver for a ride');
const finished = await call(`/api/checkins/${talk._id}/finish`, 'POST');
assert.ok(finished.requests.some((r) => r.type === 'ride' && r.blocker === true && r.quote === quote));

await call('/api/seniors/peggy/ok', 'POST');
const afterOk = await call('/api/state');
const button = afterOk.checkins.find((c) => c.channel === 'button');
assert.equal(button.medStatus, 'no_answer', 'OK does not imply medication was taken');
assert.equal(button.medsTaken, null);

await call('/api/demo/reset', 'POST');
const reset = await call('/api/state');
assert.equal(reset.appointments.length, 1, 'reset replaces appointments without duplication');
assert.equal(reset.notices.length, 1, 'reset replaces notices without duplication');
assert.equal(reset.actions.length, 0);
assert.equal(reset.tasks.filter((t) => !t.hidden).length, 2);
assert.equal(reset.checkins.length, 3);
console.log('B1 contract smoke passed: state fields, permissions, local appointment, task metadata, notices, voice integration, OK, and reset.');
