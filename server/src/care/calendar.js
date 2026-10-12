// Peggy's own phone calendar (iCloud, Google or Outlook accounts on her iPhone) → Porchlight appointments.
// Her phone reads the next two weeks with expo-calendar and posts them here. We keep them in the same
// `appointments` collection as everything else, so calls, "what do I have this week?" and ride prompts
// use her real events. Appointments that didn't come from her calendar are never touched.
import * as store from '../store.js';
import * as audit from './audit.js';

const VIRTUAL = /\b(zoom|facetime|video|telehealth|virtual|webex|teams|google meet|phone call)\b/i;
const MAX_EVENTS = 100;

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const iso = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

// Event text is untrusted: we only keep a short title, place and times. Notes and attendees never leave the phone.
export function toAppointment(seniorId, e) {
  const startsAt = iso(e?.startsAt);
  const title = clean(e?.title, 120);
  const id = clean(e?.id, 200);
  if (!startsAt || !title || !id || e.allDay) return null;
  const where = clean(e.location, 160);
  return {
    seniorId, source: 'calendar', calendarEventId: id, calendar: clean(e.calendar, 60) || null,
    title, with: null, where, startsAt, endsAt: iso(e.endsAt),
    // A video or phone appointment never needs a ride.
    needsRide: !VIRTUAL.test(`${title} ${where}`),
  };
}

export async function syncCalendar(seniorId, { events = [], from, to } = {}) {
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw Object.assign(new Error('Unknown senior'), { status: 404 });
  const incoming = (Array.isArray(events) ? events : []).slice(0, MAX_EVENTS)
    .filter((e) => clean(e?.calendar, 60) !== 'Porchlight') // our own write-backs aren't appointments
    .map((e) => toAppointment(seniorId, e)).filter(Boolean);
  const start = iso(from) || new Date().toISOString();
  const end = iso(to) || new Date(Date.now() + 14 * 86400000).toISOString();

  const existing = await store.list('appointments', { seniorId, source: 'calendar' });
  const byId = new Map(existing.map((a) => [a.calendarEventId, a]));
  const seen = new Set();
  let added = 0; let changed = 0; let removed = 0;
  for (const a of incoming) {
    if (seen.has(a.calendarEventId)) continue; // a repeating event's occurrences share an id on iOS: keep the next one
    seen.add(a.calendarEventId);
    const old = byId.get(a.calendarEventId);
    if (!old) { await store.insert('appointments', { ...a, transport: a.needsRide ? 'unknown' : 'self', actionId: null }); added++; continue; }
    const diff = ['title', 'where', 'startsAt', 'endsAt', 'calendar', 'needsRide'].some((k) => old[k] !== a[k]);
    if (diff) { await store.update('appointments', old._id, a); changed++; }
  }
  // Gone from her calendar within the window we were sent: drop it, unless a ride hangs off it (keep that history).
  for (const old of existing) {
    if (seen.has(old.calendarEventId)) continue;
    if (old.startsAt < start || old.startsAt > end) continue;
    if (old.actionId) { if (!old.cancelled) await store.update('appointments', old._id, { cancelled: true }); continue; }
    await store.remove('appointments', old._id);
    removed++;
  }
  const calendar = { connected: true, syncedAt: new Date().toISOString(), count: seen.size };
  await store.update('seniors', seniorId, { calendar });
  if (added || changed || removed) await audit.log(seniorId, 'calendar.sync', { seniorId, detail: `${added} added, ${changed} changed, ${removed} removed` });
  return { ...calendar, added, changed, removed };
}
