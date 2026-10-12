// OWNER: Person A (voice & AI).
// Call-in number: anyone can ring Porchlight's own Twilio number.
//   Peggy's number      → the same live call as her daily check-in, with all her context (meds, calendar,
//                         family, recent calls, places). Rides and messages to family ring her back first.
//   A family member     → a short spoken status for the person they care for (no private details).
//   Any other number    → a kind line on how to sign up.
// OFF until INBOUND_CALLS_ENABLED=1 (and the Twilio number's "A call comes in" webhook points at
// POST {PUBLIC_URL}/twilio/incoming). While off, the number says it isn't taking calls yet.
//
// Caller ID can be faked, so on a call IN nothing reaches other people or her screen on the caller's word
// alone: "book me an Uber" or "tell Mark…" gets "I'll ring you straight back on your own number", and the
// call back (to her verified phone) does it. A family caller never hears her summary, meds or plans.
import { Router } from 'express';
import crypto from 'node:crypto';
import * as store from '../store.js';
import { VOICE } from './notify.js';
import { startCheckin, finishCheckin } from './checkins.js';
import { sayTime } from './when.js';

export const inboundEnabled = () => process.env.INBOUND_CALLS_ENABLED === '1';

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say = (text) => `<Say voice="${VOICE}">${xml(text)}</Say>`;

// "+1 (814) 555-0123", "8145550123" and "+18145550123" are the same phone.
export function samePhone(a, b) {
  const digits = (x) => {
    const d = String(x || '').replace(/\D/g, '');
    return d.length === 10 ? `1${d}` : d;
  };
  const da = digits(a);
  return da.length >= 10 && da === digits(b);
}

// Who is calling? Her own number wins over a family member's (a shared landline is hers).
// Uses the phone numbers on accounts (seniors.phone, members.phone), which sign-up verifies by call.
export async function whoIsCalling(from) {
  if (!from) return { kind: 'unknown' };
  const seniors = await store.list('seniors');
  const senior = seniors.find((s) => samePhone(s.phone, from));
  if (senior) return { kind: 'senior', senior };
  const members = await store.list('members');
  // DEMO_FAMILY_PHONE plays the primary caregiver (the seeded number is fictional).
  const member = members.find((m) => m.circleId && (samePhone(m.phone, from) || (m.primary && samePhone(process.env.DEMO_FAMILY_PHONE, from))));
  if (member) {
    const theirs = seniors.filter((s) => s.circleId === member.circleId);
    if (theirs.length) return { kind: 'family', member, seniors: theirs };
  }
  return { kind: 'unknown' };
}

// What a family caller hears: how she is today, in plain words. Never her summary, meds, calendar or
// places, because a faked caller ID would hear it too. The app (signed in) has the details.
export async function statusLine(senior, now = new Date()) {
  const name = senior.preferredName;
  const tz = senior.timezone || 'America/New_York';
  if (senior.status === 'help') return `${name} asked for help. Please call her now, and open the Porchlight app for details. If you can't reach her, call 911.`;
  if (senior.status === 'talking') return `${name} is on a call with Porchlight right now. I'll pass on anything important.`;
  const last = senior.lastCheckinAt ? new Date(senior.lastCheckinAt) : null;
  const today = last && last.toLocaleDateString('en-US', { timeZone: tz }) === now.toLocaleDateString('en-US', { timeZone: tz });
  if (!today) {
    const time = senior.autoCall && senior.checkinTime ? ` Her daily call is set for ${senior.checkinTime.replace(/^0/, '')}.` : '';
    return `${name} hasn't checked in yet today.${time} I'll let you know if she doesn't answer.`;
  }
  const calls = (await store.list('checkins', { seniorId: senior._id })).filter((c) => c.status === 'completed')
    .sort((a, b) => new Date(b.endedAt || b.startedAt) - new Date(a.endedAt || a.startedAt));
  const mood = { good: ' She sounded in good spirits.', okay: ' She sounded okay.', low: ' She sounded a little low, so a call from you would be nice.' }[calls[0]?.mood] || '';
  const when = sayTime(last, tz, now);
  if (senior.status === 'scam') return `${name} checked in ${when}.${mood} She mentioned something that sounded like a scam, so please look at the Porchlight app.`;
  if (senior.status === 'needs-human') return `${name} checked in ${when}.${mood} Something from her call needs a look, so please open the Porchlight app.`;
  return `${name} checked in ${when}, and all was well.${mood}`;
}

// Twilio signs every webhook (X-Twilio-Signature): HMAC-SHA1 of the full URL plus the sorted POST
// fields, keyed with the auth token. Checked so nobody can fake a call by posting to our server.
export function validTwilioSignature(req, token = process.env.TWILIO_AUTH_TOKEN, base = process.env.PUBLIC_URL) {
  if (!token || !base) return true; // nothing to check against (demo mode)
  const sig = req.get('X-Twilio-Signature') || '';
  const url = base.replace(/\/$/, '') + req.originalUrl;
  const body = req.body || {};
  const data = Object.keys(body).sort().reduce((s, k) => s + k + body[k], url);
  const want = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

// A call in has ended (Twilio's status callback, or the live-call socket closing): save it like any call.
// Several signals can arrive for one call at once (socket closed, Connect ended, status webhook): finish once.
const ending = new Set();
export async function endInboundCall(checkinId) {
  if (!checkinId || ending.has(checkinId)) return;
  ending.add(checkinId);
  try {
    const checkin = await store.get('checkins', checkinId).catch(() => null);
    if (checkin?.inbound && checkin.status !== 'completed') await finishInbound(checkin);
  } finally { ending.delete(checkinId); }
}
async function finishInbound(checkin) {
  if (checkin.transcript.some((t) => t.who === 'senior')) await finishCheckin(checkin._id);
  else { // she rang off at once: not a missed check-in, and she isn't "talking" any more
    await store.update('checkins', checkin._id, { status: 'completed', endedAt: new Date().toISOString() });
    await store.update('seniors', checkin.seniorId, { status: checkin.statusBefore || 'waiting' });
  }
}

export const inboundRoutes = Router();

inboundRoutes.use('/twilio/incoming', (req, res, next) => {
  if (validTwilioSignature(req)) return next();
  console.warn('[inbound] rejected a request without a valid Twilio signature (is PUBLIC_URL the URL Twilio calls?)');
  res.sendStatus(403);
});

// The number's "A call comes in" webhook.
inboundRoutes.post('/twilio/incoming', async (req, res) => {
  const send = (inner) => res.type('text/xml').send(twiml(inner));
  if (!inboundEnabled()) return send(`${say("Hello, this is Porchlight. This number isn't taking calls yet. If this is an emergency, please hang up and call 911.")}<Hangup/>`);
  try {
    const caller = await whoIsCalling(req.body.From);
    console.log(`[inbound] call from a ${caller.kind} number (STIR/SHAKEN: ${req.body.StirVerstat || 'none'})`);
    if (caller.kind === 'senior') {
      const { senior } = caller;
      const { checkin } = await startCheckin(senior._id, 'phone');
      const helper = senior.primaryContactName ? `${senior.primaryContactName}'s AI helper` : 'your AI helper';
      const hello = `Hi ${senior.preferredName}, it's Porchlight, ${helper}. Thanks for calling. What can I do for you?`;
      await store.update('checkins', checkin._id, {
        inbound: true, trigger: 'inbound', callSid: req.body.CallSid || null, statusBefore: senior.status || null,
        transcript: [{ ...checkin.transcript[0], text: hello }],
      });
      // /twilio/voice answers in the configured voice mode (relay, gather or record), like a daily call.
      return send(`<Redirect method="POST">/twilio/voice?checkinId=${xml(checkin._id)}</Redirect>`);
    }
    if (caller.kind === 'family') {
      const first = caller.member.name.split(' ')[0];
      const lines = await Promise.all(caller.seniors.map((s) => statusLine(s)));
      return send(familyMenu(`Hi ${first}, this is Porchlight, the AI check-in helper. ${lines.join(' ')}`));
    }
    return send(`${say("Hello, this is Porchlight, an AI check-in helper for older adults and their families. I don't recognise this number. To sign up, download the Porchlight app on an iPhone and create an account with this phone number. If this is an emergency, please hang up and call 911. Goodbye.")}<Hangup/>`);
  } catch (e) {
    console.warn('[inbound] failed:', e.message);
    return send(`${say("Sorry, Porchlight can't take your call right now. Please try again in a few minutes. If this is an emergency, hang up and call 911.")}<Hangup/>`);
  }
});

// Family status: offer to say it again before saying goodbye, rather than hanging up mid-thought.
const familyMenu = (text) => `<Gather input="speech dtmf" numDigits="1" speechTimeout="2" timeout="5" hints="repeat,again,yes,no" action="/twilio/incoming/family" method="POST">`
  + `${say(`${text} To hear that again, say repeat or press 1.`)}</Gather>`
  + `${say('Thanks for calling. Goodbye.')}<Hangup/>`;
inboundRoutes.post('/twilio/incoming/family', async (req, res) => {
  const again = req.body.Digits === '1' || /\b(repeat|again|yes)\b/i.test(req.body.SpeechResult || '');
  const caller = again && inboundEnabled() ? await whoIsCalling(req.body.From).catch(() => ({})) : {};
  if (caller.kind !== 'family') return res.type('text/xml').send(twiml(`${say('Thanks for calling. Goodbye.')}<Hangup/>`));
  const lines = await Promise.all(caller.seniors.map((s) => statusLine(s)));
  res.type('text/xml').send(twiml(familyMenu(lines.join(' '))));
});

// The number's "Call status changes" webhook: a call in ended, so save it (summary, stories, family digest).
inboundRoutes.post('/twilio/incoming/status', async (req, res) => {
  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(req.body.CallStatus) && req.body.CallSid) {
    const [checkin] = await store.list('checkins', { callSid: req.body.CallSid }).catch(() => []);
    if (checkin) await endInboundCall(checkin._id).catch((e) => console.warn('[inbound] finish failed:', e.message));
  }
  res.sendStatus(204);
});
