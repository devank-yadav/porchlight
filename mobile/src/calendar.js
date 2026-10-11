import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy'; // the new object API isn't in Expo Go yet
import { api } from './api';
import { accent } from './design/tokens';

// Peggy's own iPhone calendar: iCloud, plus any Google or Outlook account she added in Settings.
// 1. Read: her next two weeks go to the server as appointments, so calls, "what do I have this week?"
//    and ride offers use her real events. Only title, place and times leave the phone, never notes.
// 2. Write: rides, reminders and call-backs Porchlight set up go into a "Porchlight" calendar on her
//    phone, so they show next to everything else and ring an alert.

const OURS = 'Porchlight';
const DAYS = 14;
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

export async function calendarStatus() {
  if (!supported) return 'unavailable';
  try { return (await Calendar.getCalendarPermissionsAsync()).status; } catch { return 'unavailable'; }
}

export async function askForCalendar() {
  if (!supported) return false;
  try { return (await Calendar.requestCalendarPermissionsAsync()).status === 'granted'; } catch { return false; }
}

async function readUpcoming() {
  const from = new Date();
  const to = new Date(Date.now() + DAYS * 86400000);
  const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => c.title !== OURS);
  if (!calendars.length) return { events: [], from, to };
  const raw = await Calendar.getEventsAsync(calendars.map((c) => c.id), from, to);
  const names = Object.fromEntries(calendars.map((c) => [c.id, c.title]));
  const events = raw
    .filter((e) => e.status !== Calendar.EventStatus.CANCELED && !keyOf(e.notes)) // not the entries Porchlight wrote
    .map((e) => ({
      // Each occurrence of a repeating event is its own appointment.
      id: e.recurrenceRule ? `${e.id}@${new Date(e.startDate).toISOString()}` : e.id,
      title: e.title || '',
      startsAt: new Date(e.startDate).toISOString(),
      endsAt: e.endDate ? new Date(e.endDate).toISOString() : null,
      allDay: !!e.allDay,
      location: e.location || '',
      calendar: names[e.calendarId] || null,
    }))
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));
  return { events, from, to };
}

let target = null; // the calendar Porchlight writes to, once found
let noTarget = false; // this phone allows no calendar Porchlight can write to: stop trying (reading still works)

async function porchlightCalendar() {
  if (target || noTarget) return target;
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const found = all.find((c) => c.title === OURS && c.allowsModifications);
  if (found) return (target = found.id);
  const make = (source) => Calendar.createCalendarAsync({
    title: OURS, color: accent.lamp, entityType: Calendar.EntityTypes.EVENT,
    sourceId: source?.id, source: Platform.OS === 'ios' ? source : { isLocalAccount: true, name: OURS },
    name: 'porchlight', ownerAccount: 'personal', accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  // Her default account (usually iCloud, so it reaches her iPad too); else a calendar on this phone only.
  const def = Platform.OS === 'ios' ? await Calendar.getDefaultCalendarAsync().catch(() => null) : null;
  const sources = Platform.OS === 'ios' ? await Calendar.getSourcesAsync().catch(() => []) : [];
  const local = sources.find((x) => x.type === Calendar.SourceType.LOCAL);
  const tries = Platform.OS === 'ios' ? [def?.source, local].filter((x, i, a) => x && a.findIndex((y) => y?.id === x.id) === i) : [undefined];
  for (const source of tries) {
    try { return (target = await make(source)); } catch { /* e.g. "That account does not allow calendars to be added" */ }
  }
  // Some accounts won't take a new calendar: use her default one. Only entries tagged porchlight: are ever changed there.
  if (def?.allowsModifications) return (target = def.id);
  noTarget = true;
  console.warn('[calendar] this phone won’t let Porchlight add calendar entries; rides and reminders stay in the app');
  return null;
}

const OPEN_RIDE = ['PENDING_APPROVAL', 'APPROVED', 'REQUESTED', 'CONFIRMED'];
const noSample = (s) => String(s || '').replace(/\s*\(sample\)/i, '');

function localDay(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// What Porchlight has set up for her, as calendar entries. key → event.
export function plannedEntries(state, senior) {
  const now = Date.now();
  const out = [];
  for (const a of state.actions || []) {
    const at = a.details?.pickupAt;
    if (a.seniorId !== senior._id || a.kind !== 'ride' || !OPEN_RIDE.includes(a.status) || !at) continue;
    if (new Date(at).getTime() < now - 3600000) continue;
    const to = noSample(a.details.to) || 'your appointment';
    const how = a.details.uberLink && !a.simulated ? 'Book it with the Book with Uber button in Porchlight.'
      : a.status === 'CONFIRMED' ? 'Simulated booking in Porchlight, not a real ride.' : 'Your family is sorting out this ride.';
    out.push({
      key: `ride:${a._id}`,
      title: `Ride to ${to}${a.simulated ? ' (simulated)' : ''}`,
      startDate: new Date(at), endDate: new Date(new Date(at).getTime() + 30 * 60000),
      notes: how, alarms: [{ relativeOffset: -30 }],
    });
  }
  for (const r of senior.reminders || []) {
    if (r.saidAt || !r.due) continue;
    const day = localDay(r.due);
    if (day.getTime() < new Date(new Date().toDateString()).getTime()) continue;
    out.push({
      key: `reminder:${r.createdAt || r.what}`,
      title: `Reminder: ${r.what}`,
      startDate: day, endDate: new Date(day.getTime() + 86400000 - 60000), allDay: true,
      notes: 'You asked Porchlight to remind you.', alarms: [{ relativeOffset: 9 * 60 }], // 9 AM that day
    });
  }
  if (senior.callbackAt && new Date(senior.callbackAt).getTime() > now) {
    const at = new Date(senior.callbackAt);
    out.push({
      key: `callback:${senior.callbackAt}`,
      title: 'Porchlight calls you back',
      startDate: at, endDate: new Date(at.getTime() + 15 * 60000),
      notes: 'You asked Porchlight to call you back.', alarms: [{ relativeOffset: 0 }],
    });
  }
  return out;
}

const tag = (key) => `\n\nporchlight:${key}`;
const keyOf = (notes) => String(notes || '').match(/porchlight:(\S+)\s*$/)?.[1] || null;

let queue = Promise.resolve();
// One write at a time, so two quick updates never create the same entry twice.
function writeBack(entries) {
  queue = queue.then(() => writeNow(entries), () => writeNow(entries));
  return queue;
}

async function writeNow(entries) {
  const calId = await porchlightCalendar();
  if (!calId) return;
  const existing = await Calendar.getEventsAsync([calId], new Date(Date.now() - 86400000), new Date(Date.now() + 60 * 86400000));
  const byKey = new Map(existing.map((e) => [keyOf(e.notes), e]));
  const want = new Set();
  for (const e of entries) {
    want.add(e.key);
    const details = {
      title: e.title, startDate: e.startDate, endDate: e.endDate, allDay: !!e.allDay,
      notes: `${e.notes}${tag(e.key)}`, alarms: e.alarms,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const old = byKey.get(e.key);
    if (!old) await Calendar.createEventAsync(calId, details);
    else if (old.title !== e.title || new Date(old.startDate).getTime() !== e.startDate.getTime()) await Calendar.updateEventAsync(old.id, details);
  }
  // Something cancelled or done: take it off her calendar. Only touches events Porchlight made.
  for (const [key, e] of byKey) {
    if (key && !want.has(key) && new Date(e.startDate).getTime() > Date.now()) await Calendar.deleteEventAsync(e.id).catch(() => {});
  }
}

let running = null;
// One full round: read her calendar → server, then Porchlight's plans → her calendar.
export function syncCalendar(senior, state) {
  if (running) return running;
  running = (async () => {
    if ((await calendarStatus()) !== 'granted') return { ok: false, reason: 'no-permission' };
    const { events, from, to } = await readUpcoming();
    const res = await api.syncCalendar(senior._id, { events, from: from.toISOString(), to: to.toISOString() });
    if (state) await writeBack(plannedEntries(state, senior));
    return { ok: true, ...res };
  })().finally(() => { running = null; });
  return running;
}

// Demo controls: ask if needed, sync, and say plainly when access is off.
export async function syncCalendarNow(senior, state) {
  if (!supported) throw new Error('Calendar sync works on a phone.');
  if ((await calendarStatus()) === 'undetermined') await askForCalendar();
  const r = await syncCalendar(senior, state);
  if (!r.ok) throw new Error('Allow calendar access for Expo Go in Settings → Privacy & Security → Calendars.');
  return r;
}

// Peggy's screen: ask once, then keep her calendar in step while the app is open.
export function useCalendarSync(senior, state) {
  const latest = useRef({ senior, state });
  useEffect(() => { latest.current = { senior, state }; }, [senior, state]);
  const plan = state && senior ? JSON.stringify(plannedEntries(state, senior).map((e) => [e.key, e.title, +e.startDate])) : '';

  useEffect(() => {
    if (!supported || !senior?._id) return undefined;
    let alive = true;
    const go = () => syncCalendar(latest.current.senior, latest.current.state).catch((e) => console.warn('[calendar]', e.message));
    (async () => {
      const status = await calendarStatus();
      if (status === 'undetermined') await askForCalendar();
      if (alive) go();
    })();
    const t = setInterval(go, 60000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && go());
    return () => { alive = false; clearInterval(t); sub.remove(); };
  }, [senior?._id]);

  // A new ride, reminder or call-back: write it to her calendar right away.
  useEffect(() => {
    if (!plan || !supported) return;
    calendarStatus().then((s) => s === 'granted' && writeBack(plannedEntries(latest.current.state, latest.current.senior)).catch((e) => console.warn('[calendar]', e.message)));
  }, [plan]);
}
