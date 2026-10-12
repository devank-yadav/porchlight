// OWNER: Person A (voice & AI).
// Daily check-in calls: the family picks a time and days in the app, and the server
// rings the senior's phone then. Needs Twilio + PUBLIC_URL; without them it only logs.
import * as store from '../store.js';
import { placeCall, twilioEnabled } from './notify.js';
import { startCheckin } from './checkins.js';

const DEFAULT_TZ = 'America/New_York';
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // Sunday = 0

export function canCall() {
  return twilioEnabled && !!process.env.PUBLIC_URL;
}

// Ring the senior now. Used by "Call now" in the app and by the daily schedule.
// A missed call is tried again before the family is bothered (demo: 2 minutes; real life ~10).
export const RETRY_MS = Number(process.env.CALL_RETRY_MS || 120000);
export const MAX_ATTEMPTS = Number(process.env.CALL_ATTEMPTS || 2);

export async function callSenior(seniorId, reason = 'now', attempt = 1, { purpose = 'checkin' } = {}) {
  if (!canCall()) {
    const err = new Error('Phone calls need TWILIO_* and PUBLIC_URL in .env. Phone calls aren’t set up on this server yet.');
    err.status = 400;
    throw err;
  }
  const senior = await store.get('seniors', seniorId);
  const { checkin } = await startCheckin(senior._id, 'phone', { purpose });
  await store.update('checkins', checkin._id, { trigger: reason, attempt });
  const base = process.env.PUBLIC_URL.replace(/\/$/, '');
  await placeCall(senior.phone, `${base}/twilio/voice?checkinId=${checkin._id}`, `${base}/twilio/status?checkinId=${checkin._id}`);
  return checkin;
}

// Local date, weekday and HH:MM for a time zone.
function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, hhmm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

export function scheduleOf(senior) {
  return {
    autoCall: senior.autoCall === true, // off until the family turns it on
    checkinTime: senior.checkinTime || '10:00',
    callDays: senior.callDays || ALL_DAYS,
    timezone: senior.timezone || DEFAULT_TZ,
  };
}

export async function setSchedule(seniorId, body) {
  const patch = {};
  if (typeof body.autoCall === 'boolean') patch.autoCall = body.autoCall;
  if (body.checkinTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.checkinTime)) {
      const err = new Error('checkinTime must be HH:MM (24-hour)');
      err.status = 400;
      throw err;
    }
    patch.checkinTime = body.checkinTime;
    patch.lastScheduledCall = null; // a new time today should still ring today
  }
  if (Array.isArray(body.callDays)) patch.callDays = [...new Set(body.callDays.map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  return store.update('seniors', seniorId, patch);
}

// Checked every 20 s; each senior is called at most once per local day.
async function tick() {
  const seniors = await store.list('seniors');
  for (const senior of seniors) {
    // "Call me back later": ring once at the time she asked for.
    if (senior.callbackAt && new Date(senior.callbackAt) <= new Date()) {
      await store.update('seniors', senior._id, { callbackAt: null });
      if (canCall()) {
        console.log(`[schedule] Calling ${senior.preferredName} back, as she asked.`);
        callSenior(senior._id, 'callback').catch((e) => console.warn('[schedule] callback failed:', e.message));
      } else console.log(`[schedule] ${senior.preferredName}'s callback is due, but Twilio is off (logged only).`);
    }
    const s = scheduleOf(senior);
    if (!s.autoCall || !senior.phone || senior.phone.startsWith('+1555')) continue; // +1555 = fictional demo numbers
    const now = localNow(s.timezone);
    if (now.hhmm !== s.checkinTime || !s.callDays.includes(now.weekday) || senior.lastScheduledCall === now.date) continue;
    await store.update('seniors', senior._id, { lastScheduledCall: now.date });
    if (!canCall()) {
      console.log(`[schedule] ${senior.preferredName}'s ${s.checkinTime} call is due, but Twilio is off (logged only).`);
      continue;
    }
    console.log(`[schedule] Calling ${senior.preferredName} for the ${s.checkinTime} check-in.`);
    callSenior(senior._id, 'scheduled').catch((e) => console.warn('[schedule] call failed:', e.message));
  }
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.warn('[schedule]', e.message)), 20000);
}

// She didn't pick up. Try again in a little while; only after the last try does the family ladder start.
// Returns true if a retry is scheduled.
export function scheduleRetry(checkin, onGiveUp) {
  const attempt = checkin.attempt || 1;
  if (attempt >= MAX_ATTEMPTS || !canCall()) return false;
  console.log(`[schedule] No answer (try ${attempt}/${MAX_ATTEMPTS}); calling again in ${Math.round(RETRY_MS / 1000)} s.`);
  setTimeout(async () => {
    const senior = await store.get('seniors', checkin.seniorId);
    // She checked in some other way meanwhile ("I'm okay" button, or she called back): no need.
    if (senior.lastCheckinAt && new Date(senior.lastCheckinAt) > new Date(checkin.startedAt)) return;
    callSenior(checkin.seniorId, checkin.trigger || 'now', attempt + 1).catch((e) => {
      console.warn('[schedule] retry failed:', e.message);
      onGiveUp?.();
    });
  }, RETRY_MS);
  return true;
}
