// OWNER: Person A (voice & AI).
// Things Peggy can get done just by saying them on a check-in:
//   "Tell Mark thanks for the milk"      → Mark gets a text with her words, and she hears them read back.
//   "Put me through to Anne"              → on a phone call, Porchlight connects her live to Anne.
//   "Remind me to call the pharmacy tomorrow" → saved; the next call that day opens with it.
//   "Call me back later, I'm busy"        → the call ends kindly and Porchlight rings again (in an hour, or when she says).
//   "What do I have this week?"           → her appointments for the next 7 days, and only confirmed rides called confirmed.
//   "Book an Uber for me"                 → right away, a "Book my Uber" button with the trip to her next
//                                           appointment filled in shows on her screen; the family is told she's going.
// Rule-based (works with no AI key) and checked before the model replies.
import * as store from '../store.js';
import * as audit from '../care/audit.js';
import { sms, push } from './notify.js';
import { parseWhen, sayTime } from './when.js';
import { proposeRide } from '../care/actions.js';
import { uberLink, geocode } from '../care/uber.js';
import { markDueTaken } from '../care/meds.js';

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
    .filter((a) => { const t = new Date(a.startsAt).getTime(); return !a.cancelled && t >= now.getTime() - 3600000 && t <= now.getTime() + 7 * 86400000; })
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));
  if (!soon.length) return "You don't have any appointments in the next week. Is there anything you'd like me to help plan?";
  const lines = soon.slice(0, 3).map((a) => {
    const ride = a.transport === 'confirmed' ? ' Your ride is confirmed.'
      : ['at_risk', 'requested'].includes(a.transport) ? ` Your family is sorting out the ride, and I'll tell you once it's confirmed.` : '';
    return `Your ${a.title.replace(/\s*\(sample\)/i, '').toLowerCase()} is ${sayTime(new Date(a.startsAt), tz, now)}${a.where ? ` at ${a.where.replace(/\s*\(sample\)/i, '')}` : ''}.${ride}`;
  });
  return `${lines.join(' ')} Anything else?`;
}

// ---------- "I took my pills" ----------
const TOOK_PILLS = /\bi(?:'ve| have)? (?:already |just )?took (?:my |the |all my )?(?:pills?|meds|medicines?|medications?|tablets?|blood pressure)|\bi(?:'ve| have) (?:already |just )?taken (?:my |the |all my )?(?:pills?|meds|medicines?|medications?|tablets?)/i;
const NOT_SURE_PILLS = /not sure|don'?t (?:know|remember)|can'?t remember|forgot|did i|have i|maybe|i think|haven'?t|didn'?t/i;

// ---------- "Book an Uber for me" ----------
export const RIDE = /\b(?:uber|lyft|taxi|cab|(?:need|want|get|book|order|call)(?: me| for me)? a (?:ride|car)|(?:don(?:'|’)?t|do not) have a ride|no ride)\b/i;

// Spoken on the call: short, so it isn't cut off. The screen notice carries the full steps.
const STEPS = "I've sent a notification to your phone. Tap it, and Uber opens with everything filled in, then press Request.";
const APPOINTMENT_PLACE = /doctor|appointment|clinic|cardiolog|heart|dentist/i;

// "to the grocery store", "to my sister's house at 4" → "grocery store", "sister's house".
const STREET = /\b\d{1,5}\s+(?:[nsew]\.?\s+|north |south |east |west )?[a-z0-9'’.]+(?:\s+[a-z0-9'’.]+){0,3}\s+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|way|court|ct|place|pl|parkway|pkwy|circle|cir)\b\.?/i;

export function rideDestination(text) {
  // A street address she says ("412 West Foster Avenue") is the destination, whatever words surround it.
  const street = String(text || '').match(STREET)?.[0];
  if (street && !/\bfrom\s+$/i.test(String(text).slice(0, String(text).indexOf(street)))) return street.replace(/\.$/, '');
  // The LAST "to X" wins: "I want to go to Target" → "Target", not "go to Target".
  const all = [...String(text || '').matchAll(/\bto ((?:the |my |a |an )?[a-z0-9'’ .-]+?)(?=\s+(?:at|by|around|tomorrow|tonight|today|now|right now|in \d|in an?|please|for|this)\b|[,!?]|\.(?:\s|$)|$)/gi)];
  const m = all.at(-1);
  const place = m?.[1]?.trim().replace(/^(?:(?:go|get|come|head|drive me)\s+to\s+)+/i, '').replace(/\s+(please|now)$/i, '');
  // A place is a name, not a sentence: "I just need an Uber" or "listen to me" is never a destination.
  if (!place || place.split(/\s+/).length > 10 || NOT_A_PLACE.test(place)) return null;
  return /^(go|get|be|talk|speak|book|call)$/i.test(place.replace(/^(the|my|a|an) /i, '')) ? null : place;
}
const NOT_A_PLACE = /\b(i|me|you|we|it|need|want|wanna|just|uber|lyft|ride|cab|taxi|listen|talk|say|said|tell|know|help|that|this)\b/i;

// A short answer to "Where would you like to go?": "Target", "the library please", "to Walmart".
export function bareDestination(text) {
  const t = String(text || '').trim().replace(/[.!?]+$/, '')
    .replace(/^(oh,? |um,? |uh,? |well,? |yeah,? |yes,? )+/i, '')
    .replace(/^(i (want|need|would like|'d like|wanna|have) to go to|i('m| am) going to|take me to|go to|to)\s+/i, '')
    .replace(/\s+(please|now|right now|today)$/i, '').trim();
  // Any place she names works ("my friend Ruth's house on Beaver Avenue"); "from home" is a pickup, not a destination.
  if (!t || t.split(/\s+/).length > 10 || /^from\b/i.test(t)) return null;
  if (/^(yes|yeah|no|nope|okay|ok|sure|fine|i don'?t know|not sure|nothing|nowhere|never ?mind)$/i.test(t)) return null;
  if (/\b(i|you|me|book|uber|ride|car|want|need|feel|am|is|was)\b/i.test(t) || NOT_A_PLACE.test(t)) return null;
  if (/^(listen|wait|hold on|hang on|hello|hi|what|huh|sorry|pardon|excuse me|one (second|moment|minute)|hmm+|um+|uh+)$/i.test(t)) return null;
  return t;
}

const ASKED_WHERE = /where would you like to go\?/i;
const GO_TO = /\b(want|need|have|like|wanna) to go to\b|\btake me to\b|\bi('m| am) going to\b/i;

// Is this turn about a ride? An explicit ask ("book me an Uber"), or an answer to "Where would you like to go?".
export function rideTurn(text, checkin) {
  const last = [...(checkin.transcript || [])].reverse().find((t) => t.who === 'porchlight')?.text || '';
  // "Where would you like to go?" stays open across a "Listen" or "Hello?" until she names a place.
  if (checkin.rideFromAsked && !checkin.rideFrom && !checkin.rideTo) return true; // answering "leaving from home?"
  const waiting = ASKED_WHERE.test(last) || checkin.rideAsked;
  return RIDE.test(text) || (waiting && Boolean(bareDestination(text) || rideDestination(text))) || (waiting && GO_TO.test(text));
}

async function rideNow(senior, text, checkin = {}) {
  const tz = senior.timezone || 'America/New_York';
  const family = senior.primaryContactName || 'your family';
  // Where to: what she says now, a short answer to "Where would you like to go?", or a place she named
  // earlier in this call ("I want to go to Target" ... "just book me an Uber").
  const earlier = [...(checkin.transcript || [])].reverse().filter((t) => t.who === 'senior').map((t) => rideDestination(t.text) || (GO_TO.test(t.text) ? bareDestination(t.text) : null)).find(Boolean);
  // Answering "Are you leaving from home?": the destination was already given; this turn is the pickup.
  if (checkin.rideFromAsked && !checkin.rideFrom && checkin.rideFor) {
    const home = /\b(yes|yeah|yep|home|house|here|my place|from home)\b/i.test(text) && !/\bnot\b/i.test(text);
    const named = text.match(/\b(?:from|at|leaving) ((?:the |my |a |an )?[a-z0-9'’ .-]+?)(?=[,.!?]|$)/i)?.[1];
    const from = home ? 'home' : ((named && !NOT_A_PLACE.test(named) ? named.trim() : null) || bareDestination(text.replace(/^\s*no,?\s*/i, '')));
    if (!from) return { reply: 'Sorry, where are you leaving from? Home, or somewhere else?' };
    checkin = { ...checkin, rideFrom: from };
    if (checkin._id) await store.update('checkins', checkin._id, { rideFrom: from });
    text = checkin.rideWhenText || text;
  }
  const place = (checkin.rideFrom && checkin.rideFor) || rideDestination(text) || bareDestination(text) || earlier || null;
  // "I'm not looking for my cardiology follow-up" is a no, not a request for that ride.
  // But "I don't have a ride to the heart doctor" is a yes: she needs that ride.
  const notAppointment = !/\b(don'?t|do not) have a ride\b|\bno ride\b/i.test(text) && /\b(not|don'?t|no)\b.{0,30}(doctor|appointment|cardiolog|clinic|follow.?up)/i.test(text);
  const forAppointment = !notAppointment && (APPOINTMENT_PLACE.test(text) || Boolean(place && APPOINTMENT_PLACE.test(place)));
  if (!place && !forAppointment) {
    if (checkin._id) await store.update('checkins', checkin._id, { rideAsked: true });
    return { reply: 'Of course. Where would you like to go?' };
  }
  // Her appointment: the ride for her next appointment.
  if (forAppointment) {
    const appts = (await store.list('appointments', { seniorId: senior._id }))
      .filter((a) => new Date(a.startsAt) > new Date() && a.transport !== 'confirmed' && a.needsRide !== false && !a.cancelled)
      .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));
    if (!appts.length) return place ? null : { reply: 'Sure. Where would you like to go?' };
    const a = appts[0];
    if (!a.where?.trim()) {
      if (checkin._id) await store.update('checkins', checkin._id, { rideAsked: true });
      return { reply: 'I found your appointment, but its address is missing. What address should I enter for your Uber?' };
    }
    await proposeRide(senior, a, text); // one open ride per appointment, so saying it twice never double-books
    const what = a.title.replace(/\s*\(sample\)/i, '').toLowerCase();
    return { reply: `Okay, a ride for your ${what} ${sayTime(new Date(a.startsAt), tz)}. ${STEPS} I'll let ${family} know you're going.` };
  }
  // Already set up on this call: don't make a second booking, just point her back to the button.
  if (checkin.rideTo && (!place || place.toLowerCase() === String(checkin.rideTo).toLowerCase())) {
    return { reply: `It's all set. Tap the Uber notification on your phone, or the Book my Uber button on your Porchlight screen, then press Request.` };
  }
  // Anywhere else she names. First: where from? (Home unless she says otherwise.)
  if (!checkin.rideFrom) {
    if (checkin._id) await store.update('checkins', checkin._id, { rideFor: place, rideFromAsked: true, rideWhenText: text, rideAsked: false });
    return { reply: `${place.replace(/^my /i, 'your ').replace(/^(the|a|an) /i, (m) => m.toLowerCase()).replace(/^\w/, (c) => c.toUpperCase())}, got it. Are you leaving from home, or from somewhere else?` };
  }
  const when = parseWhen(checkin.rideWhenText || text, tz);
  const pickupAt = (when && when > new Date() ? when : new Date()).toISOString();
  const leavingNow = !when || when - new Date() < 15 * 60000;
  const where = place.replace(/^my /i, 'your ');
  const bare = place.replace(/^(the|my|a|an) /i, '');
  const query = senior.city ? `${bare}, ${senior.city}` : bare;
  // Real pin for Uber: near her town first ("Walmart, State College"), then anywhere ("Pittsburgh airport").
  const fromHome = !checkin.rideFrom || checkin.rideFrom === 'home';
  // Looked up together so she isn't kept waiting on the line.
  const [near, anywhere, fromSpot] = await Promise.all([
    geocode(query), query !== bare ? geocode(bare) : null,
    fromHome ? null : geocode(senior.city ? `${checkin.rideFrom.replace(/^(the|my|a|an) /i, '')}, ${senior.city}` : checkin.rideFrom),
  ]);
  const spot = near || anywhere;
  const details = { pickupAt, from: fromHome ? 'Home' : checkin.rideFrom, to: where, uberLink: uberLink({ from: '12 Maple Ln (sample)', place: spot?.address || query, placeLatLng: spot?.latlng, ...(fromHome ? {} : { pickupPlace: fromSpot?.address || checkin.rideFrom, pickupLatLng: fromSpot?.latlng }) }) };
  // Shows whether Uber gets a drop-off pin (dropoff[latitude]); without one Uber leaves the field empty.
  console.log(`[ride] ${where}: drop-off ${spot ? 'pinned' : 'NOT pinned (no coordinates found)'} ${details.uberLink}`);
  const action = await store.insert('actions', {
    seniorId: senior._id, kind: 'ride', title: `Ride to ${where}`, reason: `${senior.preferredName} said: "${text}"`,
    details, appointmentId: null, approverId: null, simulated: false, status: 'APPROVED',
    history: [{ status: 'APPROVED', at: new Date().toISOString(), actor: 'porchlight', evidence: { source: 'system', note: `She asked on her call: "${text}"; family notified` } }],
  });
  if (checkin._id) await store.update('checkins', checkin._id, { rideTo: bare, rideAsked: false });
  await store.insert('notices', { seniorId: senior._id, kind: 'uber', actionId: action._id, uberLink: details.uberLink, simulated: false, at: new Date().toISOString(), text: `Your Uber to ${where}: tap Book my Uber. Uber opens with your home and ${where} filled in. Check the price, then press Request. Your driver's name, car and plate will show in Uber.` });
  await audit.log('porchlight', 'voice.ride', { seniorId: senior._id, targetId: action._id, detail: `${where} ${leavingNow ? 'now' : pickupAt}` });
  // The notification on her phone: tap it and Uber opens with both addresses filled in.
  await push(senior, { title: `Your Uber to ${where.replace(/^your /, '')} is ready`, body: 'Tap to open Uber with your trip filled in, then press Request.', url: details.uberLink });
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const time = leavingNow ? 'now' : sayTime(new Date(pickupAt), tz);
  for (const m of members.filter((x) => x.role === 'family')) await sms(m, `Heads-up: ${senior.preferredName} is taking an Uber to ${where.replace(/^your /, 'her ')} ${time}. She's booking it from her Porchlight screen.`);
  return { reply: `Okay, an Uber from ${fromHome ? 'home' : checkin.rideFrom} to ${where}, ${leavingNow ? 'leaving now' : `leaving ${time}`}. ${STEPS} I'll let ${family} know.` };
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
  // "I took my pill(s)" marks the doses due now as taken. Never on "not sure if I took" (that's the safe med-unsure path).
  if (TOOK_PILLS.test(text) && !NOT_SURE_PILLS.test(text)) {
    const marked = await markDueTaken(senior, 'call').catch(() => []);
    if (marked.length) {
      await audit.log('porchlight', 'voice.meds', { seniorId: senior._id, detail: marked.map((d) => `${d.name} ${d.time}`).join(', ') });
      const list = marked.map((d) => `${d.name.replace(/^your /i, '')}`).join(' and ');
      return { reply: `Thank you. I've marked your ${list} as taken for ${marked[0].label}. What else is going on today?` };
    }
  }
  // A call she made IN to Porchlight's number: caller ID can be faked, so a ride or a message to family
  // waits for a call back to her own verified number (voice/inbound.js). Connecting her to family still works.
  if (checkin.inbound) {
    const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
    const what = rideTurn(text, checkin) ? 'set up that ride' : detectIntent(text, members)?.kind === 'message' ? 'send that message' : null;
    if (what) {
      await store.update('checkins', checkin._id, { ringBack: what });
      return { reply: `I can do that. To keep your account safe, I'll ${what} on a call to your own number, so I'll ring you straight back once we hang up. Just ask me again then.`, end: true };
    }
  }
  if (rideTurn(text, checkin)) {
    const ride = await rideNow(senior, text, checkin);
    if (ride) return ride;
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
