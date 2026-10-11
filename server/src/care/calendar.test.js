import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';
import { seed } from './seed.js';
import { syncCalendar, toAppointment } from './calendar.js';

const inDays = (d, h = 10) => { const t = new Date(Date.now() + d * 86400000); t.setHours(h, 0, 0, 0); return t.toISOString(); };

test('phone calendar events become appointments, update in place, and disappear when deleted', async () => {
  await store.connect();
  await seed();
  const events = [
    { id: 'e1', title: 'Dentist', startsAt: inDays(2), endsAt: inDays(2, 11), location: 'Main St Dental', calendar: 'Home', notes: 'secret' },
    { id: 'e2', title: 'Telehealth with Dr. Kim', startsAt: inDays(3), calendar: 'Home' },
    { id: 'e3', title: "Mark's birthday", startsAt: inDays(4, 0), allDay: true, calendar: 'Home' },
    { id: 'p1', title: 'Tella: ride', startsAt: inDays(2), calendar: 'Tella' },
  ];
  const r = await syncCalendar('peggy', { events });
  assert.equal(r.added, 2);
  let appts = await store.list('appointments', { seniorId: 'peggy', source: 'calendar' });
  assert.equal(appts.length, 2);
  const dentist = appts.find((a) => a.title === 'Dentist');
  assert.equal(dentist.where, 'Main St Dental');
  assert.equal(dentist.needsRide, true);
  assert.equal(dentist.notes, undefined);
  assert.equal(appts.find((a) => a.calendarEventId === 'e2').needsRide, false);
  assert.ok(await store.get('appointments', 'cardiology'), 'sample appointment untouched');

  const again = await syncCalendar('peggy', { events: [{ ...events[0], startsAt: inDays(2, 15) }] });
  assert.deepEqual([again.added, again.changed, again.removed], [0, 1, 1]);
  appts = await store.list('appointments', { seniorId: 'peggy', source: 'calendar' });
  assert.equal(appts.length, 1);
  assert.equal(appts[0]._id, dentist._id);
  assert.equal((await store.get('seniors', 'peggy')).calendar.count, 1);
});

test('junk events are ignored', () => {
  assert.equal(toAppointment('peggy', { id: 'x', title: '', startsAt: inDays(1) }), null);
  assert.equal(toAppointment('peggy', { id: 'x', title: 'A', startsAt: 'nope' }), null);
  assert.equal(toAppointment('peggy', null), null);
});
