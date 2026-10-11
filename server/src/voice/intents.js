// OWNER: Person A (voice & AI).
// Things Peggy can get done just by saying them on a check-in:
//   "Tell Mark thanks for the milk"      → Mark gets a text with her words, and she hears them read back.
//   "Put me through to Anne"              → on a phone call, Porchlight connects her live to Anne.
//   "Remind me to call the pharmacy tomorrow" → saved; the next call that day opens with it.
//   "Call me back later, I'm busy"        → the call ends kindly and Porchlight rings again (in an hour, or when she says).
//   "What do I have this week?"           → her appointments for the next 7 days, and only confirmed rides called confirmed.
// Rule-based (works with no AI key) and checked before the model replies.
import * as store from '../store.js';
import * as audit from '../care/audit.js';
import { sms } from './notify.js';
import { parseWhen, sayTime } from './when.js';

const RELATIONS = { daughter: /daughter/i, son: /\bson\b/i, neighbor: /neighbou?r/i, neighbour: /neighbou?r/i, volunteer: /volunteer/i };

// "Anne", "my daughter", "Mark" → a circle member.
// Speech-to-text hears "Annie" for Anne, "Marc" for Mark: allow one letter of slack, or a nickname ending.
function sameName(heard, name) {
  const sound = (x) => x.replace(/ph/g, 'f').replace(/c(?=[^eiy]|$)/g, 'k');
  heard = sound(heard); name = sound(name);
  if (heard === name) return true;
  if (heard.length >= 3 && (heard.replace(/(ie|y)$/, '') === name.replace(/e$/, '') || name.replace(/(ie|y)$/, '') === heard.replace(/e$/, ''))) return true;
  if (Math.abs(heard.length - name.length) > 1 || Math.min(heard.length, name.length) < 5) return false;
  let i = 0, j = 0, edits = 0;
  while (i < heard.length && j < name.length) {
    if (heard[i] === name[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (heard.length > name.length) i++; else if (heard.length < name.length) j++; else { i++; j++; }
  }
  return edits + (heard.length - i) + (name.length - j) <= 1;
}

function findMember(word, members) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return null;
  return members.find((m) => sameName(w, m.name.split(' ')[0].toLowerCase()))
    || (RELATIONS[w] && members.find((m) => RELATIONS[w].test(m.relation || '')))
    || null;
}

const CONNECT = /\b(?:put me through to|connect me (?:to|with)|(?:can|could|would) you (?:please )?(?:call|ring|get|dial)|please (?:call|ring|dial)|i(?:'|’)?d like to (?:talk|speak) (?:to|with)|i want to (?:talk|speak) (?:to|with)|let me (?:talk|speak) (?:to|with))\s+(?:my\s+)?([a-z]+)/i;
const MESSAGE = /\b(?:tell|text|message)\s+(?:my\s+)?([a-z]+)\s*,?\s*(?:that\s+)?(.{3,})$/i;
const LET_KNOW = /\blet\s+(?:my\s+)?([a-z]+)\s+know\s*,?\s*(?:that\s+)?(.{3,})$/i;

export function detectIntent(text, members) {
  const t = String(text || '').trim();
  const c = t.match(CONNECT);
  if (c) {
    const member = findMember(c[1], members);
    if (member) return { kind: 'connect', member };
  }
  const m = t.match(MESSAGE) || t.match(LET_KNOW);
  if (m) {
    const member = findMember(m[1], members);
    const message = m[2].trim().replace(/[.!?]+$/, '');
    if (member && message.split(/\s+/).length >= 1) return { kind: 'message', member, message };
  }
  return null;
}

// Demo phones are +1555…; DEMO_FAMILY_PHONE gives the primary caregiver a real number to ring.
export function dialableNumber(member) {
  const phone = member.primary && process.env.DEMO_FAMILY_PHONE ? process.env.DEMO_FAMILY_PHONE : member.phone;
  return phone && !phone.startsWith('+1555') ? phone : null;
}

// ---------- Reminders ----------
const REMIND = /\bremind me\s+(?:to\s+|that\s+|about\s+)?(.+?)[.!?]*$/i;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WHEN = /\s*,?\s*\b(today|tonight|this (?:afternoon|evening)|tomorrow(?: morning| afternoon| evening)?|on (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b\s*$/i;

// Local calendar date (YYYY-MM-DD) in her time zone, `plus` days from now.
export function localDate(tz = 'America/New_York', plus = 0, now = new Date()) {
  const d = new Date(new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime() + plus * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "remind me to call the pharmacy tomorrow" → { what: 'call the pharmacy', when: 'tomorrow', due: '2026-10-12' }.
// No day said → due at her next check-in on a later day.
export function parseReminder(text, tz = 'America/New_York', now = new Date()) {
  const r = String(text || '').match(REMIND);
  if (!r) return null;
  let what = r[1].trim();
  const w = what.match(WHEN);
  let when = null;
  let due = null;
  if (w) {
    what = what.slice(0, w.index).trim();
    when = w[1].toLowerCase();
    const today = new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay();
    if (/^(today|tonight|this)/.test(when)) due = localDate(tz, 0, now);
    else if (when.startsWith('tomorrow')) due = localDate(tz, 1, now);
    else {
      const day = DAYS.indexOf(when.replace(/^on /, ''));
      due = localDate(tz, ((day - today + 7) % 7) || 7, now);
    }
  }
  what = what.replace(/\bmy\b/gi, 'your').replace(/\bI\b/g, 'you');
  return what.length > 2 ? { what, when, due } : null;
}

// Reminders due at a check-in today (and mark them said, so they're not repeated).
export async function dueReminders(senior) {
  const today = localDate(senior.timezone || 'America/New_York');
  const all = senior.reminders || [];
  const due = all.filter((r) => !r.saidAt && (r.due ? r.due <= today : r.createdOn < today));
  if (due.length) {
    const saidAt = new Date().toISOString();
    await store.update('seniors', senior._id, { reminders: all.map((r) => (due.includes(r) ? { ...r, saidAt } : r)) });
  }
  return due;
}

// ---------- Call me back later ----------
const BUSY = /\b(?:(?:call|ring) me (?:back )?(?:later|another time|in (?:a bit|a while|an? hour|\w+ (?:minutes?|hours?))|at \S+|tonight|tomorrow)|(?:can|could) you (?:call|ring) (?:me )?(?:back )?later|i(?:'|’)?m (?:busy|in the middle of)|i am (?:busy|in the middle of)|(?:not|isn(?:'|’)?t) a good time|bad time)\b/i;

// "call me back at 4" → 4 PM; "I'm busy" → an hour from now. Never sooner than 5 minutes, never more than a day.
export function callbackTime(text, tz = 'America/New_York', now = new Date()) {
  if (!BUSY.test(String(text || ''))) return null;
  const said = parseWhen(text, tz, now);
  const min = now.getTime() + 5 * 60000; const max = now.getTime() + 24 * 3600000;
  return said && said.getTime() >= min && said.getTime() <= max ? said : new Date(now.getTime() + 60 * 60000);
}

// ---------- What do I have this week? ----------
const MY_WEEK = /\b(?:what(?:'|’)?s on my (?:calendar|schedule)|what (?:do i have|have i got|is coming up|'?s coming up)|any(?:thing| appointments)? (?:coming up|this week|tomorrow)|when is my (?:doctor|appointment|next appointment)|my (?:appointments|schedule) (?:this week|tomorrow)|do i have (?:any )?(?:appointments|anything))\b/i;

export function weekSummary(appointments, tz = 'America/New_York', now = new Date()) {
  const soon = appointments
    .filter((a) => { const t = new Date(a.startsAt).getTime(); return t >= now.getTime() - 3600000 && t <= now.getTime() + 7 * 86400000; })
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));
  if (!soon.length) return "You don't have any appointments in the next week. Is there anything you'd like me to help plan?";
  const lines = soon.slice(0, 3).map((a) => {
    const ride = a.transport === 'confirmed' ? ' Your ride is confirmed.'
      : ['at_risk', 'requested'].includes(a.transport) ? ` Your family is sorting out the ride, and I'll tell you once it's confirmed.` : '';
    return `Your ${a.title.replace(/\s*\(sample\)/i, '').toLowerCase()} is ${sayTime(new Date(a.startsAt), tz, now)}${a.where ? ` at ${a.where.replace(/\s*\(sample\)/i, '')}` : ''}.${ride}`;
  });
  return `${lines.join(' ')} Anything else?`;
}

// Runs the intent. Returns { reply, transfer?, end? } or null when nothing matched.
export async function handleIntent(senior, checkin, text) {
  const tz = senior.timezone || 'America/New_York';
  const callback = checkin.channel === 'phone' ? callbackTime(text, tz) : null;
  if (callback) {
    // Not a missed check-in: she picked up and asked for later.
    await store.update('seniors', senior._id, { callbackAt: callback.toISOString() });
    await store.update('checkins', checkin._id, { callbackAt: callback.toISOString() });
    await audit.log('porchlight', 'voice.callback', { seniorId: senior._id, detail: callback.toISOString() });
    return { reply: `No problem at all. I'll call you back ${sayTime(callback, tz)}. Bye for now!`, end: true };
  }
  if (MY_WEEK.test(text)) {
    return { reply: weekSummary(await store.list('appointments', { seniorId: senior._id }), tz) };
  }
  const reminder = parseReminder(text, senior.timezone);
  if (reminder) {
    const entry = { ...reminder, createdOn: localDate(senior.timezone), createdAt: new Date().toISOString(), checkinId: checkin._id };
    await store.update('seniors', senior._id, { reminders: [...(senior.reminders || []), entry] });
    await audit.log('porchlight', 'voice.reminder', { seniorId: senior._id, detail: `${reminder.what} (${reminder.when || 'next call'})` });
    const when = !reminder.when ? 'on our next call' : /^(today|tonight|this)/.test(reminder.when) ? 'later today' : reminder.when;
    return { reply: `Got it. I'll remind you ${when} to ${reminder.what}. Anything else?` };
  }
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const intent = detectIntent(text, members);
  if (!intent) return null;
  const first = intent.member.name.split(' ')[0];

  if (intent.kind === 'message') {
    // Her own words, read back to her first, then sent.
    await sms(intent.member, `${senior.preferredName} asked me to tell you: "${intent.message}"`);
    await audit.log('porchlight', 'voice.message', { seniorId: senior._id, targetId: intent.member._id, detail: intent.message });
    return { reply: `Okay, I've sent ${first} your message: "${intent.message}." Anything else?` };
  }

  const phone = checkin.channel === 'phone' ? dialableNumber(intent.member) : null;
  await audit.log('porchlight', 'voice.connect', { seniorId: senior._id, targetId: intent.member._id, detail: phone ? 'live transfer' : 'asked to call back' });
  if (phone) {
    // A heads-up text first, so a missed call still reaches them.
    await sms(intent.member, `${senior.preferredName} is calling you through Porchlight right now. If you miss it, please call her back.`);
    return { reply: `Of course. I'm connecting you to ${first} now. Please stay on the line.`, transfer: phone };
  }
  await sms(intent.member, `${senior.preferredName} asked to talk to you. Please give her a call when you can.`);
  return { reply: `I can't put you through right now, so I've texted ${first} to call you. Is there anything else?` };
}
