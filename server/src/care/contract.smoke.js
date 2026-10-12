// HTTP smoke check: the state contract, per-account access, and the account and care-circle flows.
// Start a fresh test server first:  SEED_DEMO=1 PERSIST_FILE=off node server/src/index.js
// then:  node server/src/care/contract.smoke.js [http://localhost:3001]
import assert from 'node:assert/strict';

const base = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
async function raw(path, method = 'GET', body, token) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(8000), headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const as = (token) => async (path, method = 'GET', body) => {
  const r = await raw(path, method, body, token);
  assert.equal(r.status, 200, `${method} ${path}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

// Sign in with the development code (fictional +1555 numbers are never called).
async function signIn(phone, role) {
  const start = await raw('/api/auth/start', 'POST', { phone, role });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assert.equal(start.data.channel, 'dev');
  const wrong = await raw('/api/auth/verify', 'POST', { phone, role, code: start.data.devCode === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400, 'a wrong code is refused');
  const ok = await raw('/api/auth/verify', 'POST', { phone, role, code: start.data.devCode });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  return ok.data;
}

// ---- Signed out: nothing is readable.
assert.equal((await raw('/api/state')).status, 401);
assert.equal((await raw('/api/seniors/peggy/help', 'POST')).status, 401);
assert.equal((await raw('/api/auth/start', 'POST', { phone: '+15550100001', role: 'senior' })).status, 409, 'one role per number');

// ---- The seeded circle, seen by Anne (primary) and Mark.
const anne = await signIn('+15550100001', 'family');
const mark = await signIn('+15550100002', 'family');
const A = as(anne.token);
const M = as(mark.token);
const state = await A('/api/state');
for (const key of ['seniors', 'members', 'checkins', 'tasks', 'escalations', 'events', 'scamChecks', 'notifications', 'appointments', 'actions', 'notices']) {
  assert.ok(Array.isArray(state[key]), `${key} is an array`);
}
assert.equal(state.me.memberId, 'anne');
assert.equal(state.seniors.length, 1);
assert.equal(state.seniors[0].pushToken, undefined, 'push tokens never leave the server');
assert.equal(typeof state.digest.line, 'string');
const anneM = state.members.find((m) => m._id === 'anne');
assert.equal(anneM.canApprove, true);
assert.equal(anneM.seesMeds, true);
const markView = await M('/api/state');
assert.equal(markView.seniors[0].meds.length, 0, 'Mark cannot see medicines');
assert.equal((await raw('/api/seniors/peggy/meds', 'POST', { name: 'x', times: ['08:00'] }, mark.token)).status, 403);

const appointment = state.appointments.find((a) => a.seniorId === 'peggy');
assert.equal(appointment.transport, 'unknown');
assert.equal(state.actions.length, 0, 'a fresh demo has no invented ride booking');
for (const task of state.tasks) {
  assert.ok(task.requestedBy === 'senior' || state.members.some((m) => m._id === task.requestedBy));
  assert.equal(typeof task.sensitive, 'boolean');
}

// ---- The scripted call → a ride handed to Peggy (no sample booking), and tasks.
const finished = await A('/api/demo/call', 'POST');
assert.ok(finished.requests.some((r) => r.type === 'ride' && r.blocker === true));
const afterCall = await A('/api/state');
const ride = afterCall.actions.find((a) => a.kind === 'ride');
assert.ok(ride, 'a ride action exists');
assert.equal(ride.simulated, undefined, 'no simulated bookings');
assert.match(ride.details.uberLink, /^https:\/\/m\.uber\.com\/ul\//);
assert.ok(afterCall.notices.some((n) => n.kind === 'uber'), 'Peggy gets a Book my Uber button');

// ---- Task buttons act as the signed-in member, whatever the body says.
const open = afterCall.tasks.find((t) => t.status === 'open' && !t.assignee);
const claimed = await M(`/api/tasks/${open._id}/claim`, 'POST', { memberId: 'anne' });
assert.equal(claimed.assignee, 'mark');

// ---- A brand-new family: a daughter sets Porchlight up for her dad, invites her brother, and dad joins.
const lucy = await signIn('+15550200001', 'family');
assert.equal(lucy.me.setupDone, false);
const L = as(lucy.token);
assert.deepEqual((await L('/api/state')).seniors, [], 'a new account starts empty');
assert.equal((await raw('/api/state', 'GET', null, lucy.token)).status, 200);
assert.equal((await raw('/api/seniors/peggy/help', 'POST', null, lucy.token)).status, 409, 'no circle yet');
await L('/api/setup/family', 'POST', { name: 'Lucy Park', timezone: 'America/Chicago' });
const lucyMe = await L('/api/setup/family/parent', 'POST', { preferredName: 'Walter', phone: '(555) 020-0009', relation: 'Daughter' });
assert.equal(lucyMe.setupDone, true);
const lucyState = await L('/api/state');
assert.equal(lucyState.seniors[0].preferredName, 'Walter');
assert.equal(lucyState.seniors[0].primaryContactName, 'Lucy');
assert.equal(lucyState.events.length, 0, 'no sample events');
assert.equal((await raw(`/api/seniors/peggy/meds`, 'POST', { name: 'x' }, lucy.token)).status, 403, 'other circles are off limits');
assert.equal((await raw(`/api/seniors/${lucyState.seniors[0]._id}/help`, 'POST', null, anne.token)).status, 403, 'and the other way round');

const { code } = await L('/api/circle/invites', 'POST');
const ben = await signIn('+15550200002', 'family');
const B = as(ben.token);
await B('/api/setup/family', 'POST', { name: 'Ben Park' });
assert.equal((await raw('/api/setup/family/join', 'POST', { code: 'ZZZZZZ' }, ben.token)).status, 404);
await B('/api/setup/family/join', 'POST', { code: code.toLowerCase(), relation: 'Son' });
const benState = await B('/api/state');
assert.equal(benState.seniors[0].preferredName, 'Walter');
assert.equal(benState.members.find((m) => m._id === benState.me.memberId).seesMeds, false, 'a joiner starts without medicine access');

const walter = await signIn('+15550200009', 'senior');
assert.equal(walter.me.offers.length, 1, 'dad is offered the circle Lucy made');
const W = as(walter.token);
const walterMe = await W('/api/setup/senior', 'POST', { preferredName: 'Walt', join: walter.me.offers[0].id, timezone: 'America/Chicago' });
assert.equal(walterMe.setupDone, true);
assert.equal((await W('/api/state')).members.length, 2);

// ---- Leaving: Ben deletes his account; Walter deletes his, which removes the circle's data.
await B('/api/me', 'DELETE');
assert.equal((await raw('/api/state', 'GET', null, ben.token)).status, 401);
await W('/api/me', 'DELETE');
const lucyAfter = await L('/api/state');
assert.deepEqual(lucyAfter.seniors, [], 'Walter’s data is gone');
await L('/api/auth/logout', 'POST');
assert.equal((await raw('/api/state', 'GET', null, lucy.token)).status, 401, 'signed out');

console.log('Contract smoke passed: access control, state fields, permissions, demo call → Uber hand-off, tasks, sign-in, circles, invites, deletion.');
