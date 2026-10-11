import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';
import { seed } from './seed.js';
import * as meds from './meds.js';
import { buildDigest } from './digest.js';
import { handleCheckinOutcome } from './outcomes.js';

// A moment that is HH:MM in New York on a fixed day (EDT, UTC-4).
const nyAt = (hhmm) => new Date(`2026-10-11T${hhmm}:00-04:00`);

test('dose statuses follow the clock: upcoming, due, missed, taken', async () => {
  const senior = { _id: 'p', meds: [{ id: 'm1', name: 'blood pressure pill', dose: '1 tablet', times: ['08:00', '20:00'] }] };
  const at = (hhmm, doses = []) => meds.dosesToday(senior, doses, nyAt(hhmm)).map((d) => `${d.time} ${d.status}`);
  assert.deepEqual(at('07:30'), ['08:00 upcoming', '20:00 upcoming']);
  assert.deepEqual(at('08:30'), ['08:00 due', '20:00 upcoming']);
  assert.deepEqual(at('10:01'), ['08:00 missed', '20:00 upcoming']);
  const taken = [{ seniorId: 'p', medId: 'm1', date: '2026-10-11', time: '08:00', at: 'x', by: 'peggy' }];
  assert.deepEqual(at('20:15', taken), ['08:00 taken', '20:00 due']);
  assert.equal(meds.whenText(['08:00', '20:00']), '8:00 AM and 8:00 PM');
});

test('family and Peggy can add, edit and remove meds; legacy meds get ids and times', async () => {
  await store.connect();
  await seed();
  const added = await meds.addMed('peggy', { name: '  Eye drops ', dose: '1 drop', times: ['21:00', 'bad', '09:00'] });
  assert.equal(added.name, 'Eye drops');
  assert.deepEqual(added.times, ['09:00', '21:00']);
  assert.equal(added.when, '9:00 AM and 9:00 PM');
  const edited = await meds.editMed('peggy', added.id, { times: ['09:00'] });
  assert.equal(edited.dose, '1 drop');
  assert.equal(edited.when, '9:00 AM');
  await assert.rejects(meds.addMed('peggy', { name: ' ' }), /needs a name/);
  await meds.removeMed('peggy', added.id);
  assert.ok(!(await store.get('seniors', 'peggy')).meds.some((m) => m.id === added.id));
  assert.deepEqual(meds.normalizeMeds([{ name: 'old', when: 'evening' }])[0], { id: 'med_0', dose: '', times: ['20:00'], name: 'old', when: 'evening' });
});

test('marking taken is idempotent and undoable; "I took my pills" marks only doses already due', async () => {
  await store.connect();
  await store.clearAll();
  await store.insert('seniors', { _id: 'peggy', preferredName: 'Peggy', meds: [{ id: 'a', name: 'A', times: ['00:00'] }, { id: 'b', name: 'B', times: ['23:59'] }] });
  const now = new Date();
  const senior = await store.get('seniors', 'peggy');
  const { minutes } = meds.localNow('America/New_York', now);
  const marked = await meds.markDueTaken(senior, 'call', now);
  assert.deepEqual(marked.map((d) => d.medId), minutes < 23 * 60 + 59 ? ['a'] : ['a', 'b']);
  if (minutes < 23 * 60 + 59) assert.ok(!(await store.list('doses')).some((d) => d.medId === 'b'), 'a future dose is never marked');
  const again = await meds.markTaken('peggy', { medId: 'a', time: '00:00' });
  assert.equal((await store.list('doses')).filter((d) => d.medId === 'a').length, 1);
  assert.equal(again.by, 'call');
  await meds.unmark('peggy', { medId: 'a', time: '00:00' });
  assert.equal((await store.list('doses')).length, 0);
  await assert.rejects(meds.markTaken('peggy', { medId: 'a', time: '07:00' }), /No such dose/);
});

test('a call where she says she took her pills marks due doses; missed doses reach the digest for Anne only', async () => {
  await store.connect();
  await store.clearAll();
  const senior = await store.insert('seniors', { _id: 'peggy', preferredName: 'Peggy', meds: [{ id: 'a', name: 'blood pressure pill', times: ['00:00'] }] });
  const missed = meds.dosesToday(senior, []);
  const anne = { seesMeds: true }, mark = { seesMeds: false };
  const fake = missed.map((d) => ({ ...d, status: 'missed' }));
  const digest = (viewer) => buildDigest({ senior, checkins: [], tasks: [], actions: [], escalations: [], viewer, medsToday: fake });
  assert.match(digest(anne).items.map((i) => i.text).join(), /hasn't marked her 12:00 AM blood pressure pill/);
  assert.doesNotMatch(digest(mark).items.map((i) => i.text).join(), /pill/);

  const checkin = await store.insert('checkins', { seniorId: 'peggy', endedAt: new Date().toISOString() });
  await handleCheckinOutcome(senior, checkin, { summary: 'Fine.', flags: [], requests: [], medStatus: 'taken' });
  const [dose] = await store.list('doses');
  assert.equal(dose.by, 'call');
  assert.equal(dose.medId, 'a');
});
