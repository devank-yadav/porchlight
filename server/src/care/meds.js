// Medications: Peggy's list (name, dose, times of day) and today's doses (taken / due / upcoming / missed).
// Reminders themselves are local notifications on her phone (mobile/src/meds/reminders.js); this file is
// the record they, the app buttons and the calls all write to. Never dosing or medical advice: we only
// record what she says she took.
import * as store from '../store.js';

const DEFAULT_TZ = 'America/New_York';
export const MISSED_AFTER_MIN = 120; // a dose not marked two hours after its time counts as missed

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Peggy's local date ('2026-10-11') and minutes since midnight.
export function localNow(tz = DEFAULT_TZ, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// '08:00' → '8:00 AM'
export function clock(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
}

// The readable `when` the call prompt already uses ("8:00 AM and 8:00 PM").
export function whenText(times = []) {
  const t = times.map(clock);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : t[0] || 'as needed';
}

function cleanMed(input, existing = {}) {
  const name = String(input.name ?? existing.name ?? '').trim().slice(0, 60);
  if (!name) throw Object.assign(new Error('A medication needs a name'), { status: 400 });
  const times = [...new Set((input.times ?? existing.times ?? []).filter((t) => HHMM.test(t)))].sort();
  const dose = String(input.dose ?? existing.dose ?? '').trim().slice(0, 40);
  return { ...existing, name, dose, times, when: whenText(times) };
}

async function getSenior(id) {
  const senior = await store.get('seniors', id);
  if (!senior) throw Object.assign(new Error('Senior not found'), { status: 404 });
  return senior;
}

const medId = () => `med_${store.newId().slice(0, 8)}`;

// Older records (seeded before this feature) have no id or times: give them both, once.
export function normalizeMeds(meds = []) {
  return meds.map((m, i) => ({
    id: m.id || `med_${i}`,
    dose: '',
    times: m.times || (/evening|night/i.test(m.when || '') ? ['20:00'] : ['08:00']),
    ...m,
  }));
}

export async function addMed(seniorId, input) {
  const senior = await getSenior(seniorId);
  const med = { id: medId(), ...cleanMed(input) };
  await store.update('seniors', seniorId, { meds: [...normalizeMeds(senior.meds), med] });
  return med;
}

export async function editMed(seniorId, id, input) {
  const senior = await getSenior(seniorId);
  const meds = normalizeMeds(senior.meds);
  const i = meds.findIndex((m) => m.id === id);
  if (i < 0) throw Object.assign(new Error('Medication not found'), { status: 404 });
  meds[i] = cleanMed(input, meds[i]);
  await store.update('seniors', seniorId, { meds });
  return meds[i];
}

export async function removeMed(seniorId, id) {
  const senior = await getSenior(seniorId);
  await store.update('seniors', seniorId, { meds: normalizeMeds(senior.meds).filter((m) => m.id !== id) });
  return { ok: true };
}

// Today's doses for one senior, in time order.
export function dosesToday(senior, doses, now = new Date()) {
  const { date, minutes } = localNow(senior.timezone || DEFAULT_TZ, now);
  const rows = [];
  for (const m of normalizeMeds(senior.meds)) {
    for (const time of m.times) {
      const log = doses.find((d) => d.seniorId === senior._id && d.medId === m.id && d.date === date && d.time === time);
      const t = toMinutes(time);
      const status = log ? 'taken' : minutes < t ? 'upcoming' : minutes < t + MISSED_AFTER_MIN ? 'due' : 'missed';
      rows.push({ seniorId: senior._id, medId: m.id, name: m.name, dose: m.dose, date, time, label: clock(time), status, takenAt: log?.at ?? null, by: log?.by ?? null });
    }
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

export async function medsToday(senior, now = new Date()) {
  return dosesToday(senior, await store.list('doses', { seniorId: senior._id }), now);
}

// Doses she could be asked about now: due or missed today, not yet taken.
export async function medsDueNow(senior, now = new Date()) {
  return (await medsToday(senior, now)).filter((d) => d.status === 'due' || d.status === 'missed');
}

// Record a dose as taken. Same dose twice is a no-op.
export async function markTaken(seniorId, { medId: id, time, date, by = 'senior' }) {
  const senior = await getSenior(seniorId);
  const med = normalizeMeds(senior.meds).find((m) => m.id === id);
  if (!med || !med.times.includes(time)) throw Object.assign(new Error('No such dose'), { status: 404 });
  const day = date || localNow(senior.timezone || DEFAULT_TZ).date;
  const _id = `${seniorId}:${id}:${day}:${time}`;
  const existing = await store.get('doses', _id);
  if (existing) return existing;
  return store.insert('doses', { _id, seniorId, medId: id, name: med.name, date: day, time, status: 'taken', by, at: new Date().toISOString() });
}

export async function unmark(seniorId, { medId: id, time, date }) {
  const senior = await getSenior(seniorId);
  const day = date || localNow(senior.timezone || DEFAULT_TZ).date;
  await store.remove('doses', `${seniorId}:${id}:${day}:${time}`);
  return { ok: true };
}

// "I took my pill" on a call or in chat: every dose that's due or missed so far today → taken.
export async function markDueTaken(senior, by = 'call', now = new Date()) {
  const due = await medsDueNow(senior, now);
  for (const d of due) await markTaken(senior._id, { medId: d.medId, time: d.time, date: d.date, by });
  return due;
}

// One line for the call prompt, e.g. "blood pressure pill (1 tablet) at 8:00 PM".
export const doseLine = (d) => `${d.name}${d.dose ? ` (${d.dose})` : ''} at ${d.label}`;
