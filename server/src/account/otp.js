// Sign-in codes, delivered by a phone call that reads the code out loud.
// 1. Twilio Verify (TWILIO_VERIFY_SERVICE_SID set): Verify calls the number and checks the code.
// 2. Otherwise, with Twilio voice set up (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER): we make the code,
//    keep only its hash, and a Twilio call reads it twice.
// 3. No Twilio (development): the code is printed in the server log and returned to the app so the
//    flow can be tried with an empty .env. Never in production.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import * as store from '../store.js';
import { twilioEnabled, sayOnCall } from '../voice/notify.js';
import { HttpError } from './errors.js';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const verifyEnabled = Boolean(SID && TOKEN && VERIFY_SID);
const production = process.env.NODE_ENV === 'production';
const CODE_TTL_MS = 10 * 60000;
const MAX_TRIES = 5;

export function codeChannel(phone) {
  const fake = phone.startsWith('+1555');
  if (verifyEnabled && !fake) return 'verify';
  if (twilioEnabled && !fake) return 'call';
  return production ? null : 'dev';
}

// Rate limits (in memory, per server): a code at most every 30 s and 5 an hour per number, 30 an hour per address.
const sends = new Map();
function limited(key, max, windowMs, gapMs = 0) {
  const now = Date.now();
  const list = (sends.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return Math.ceil((list[0] + windowMs - now) / 1000);
  if (gapMs && list.length && now - list[list.length - 1] < gapMs) return Math.ceil((list[list.length - 1] + gapMs - now) / 1000);
  list.push(now);
  sends.set(key, list);
  return 0;
}
export function checkLimit(key, max, windowMs, gapMs) {
  const wait = limited(key, max, windowMs, gapMs);
  if (wait) throw new HttpError(429, `Too many tries. Please wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.`);
}

const hash = (phone, code) => createHash('sha256').update(`${phone}:${code}:${TOKEN || 'porchlight'}`).digest('hex');

async function twilioVerify(path, params) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${VERIFY_SID}/${path}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Returns { channel, devCode? }.
export async function sendCode(phone, ip) {
  checkLimit(`phone:${phone}`, 5, 3600000, 30000);
  checkLimit(`ip:${ip}`, 30, 3600000);
  const channel = codeChannel(phone);
  if (!channel) throw new HttpError(503, 'Sign-in calls aren’t set up on this server yet.');
  if (channel === 'verify') {
    const r = await twilioVerify('Verifications', { To: phone, Channel: 'call' });
    if (!r.ok) {
      console.warn('[otp] Verify refused:', r.status, r.data?.code);
      throw new HttpError(r.status === 429 ? 429 : 502, r.status === 429 ? 'Too many calls to this number. Please try again later.' : 'We couldn’t call that number. Check it and try again.');
    }
    return { channel: 'call' };
  }
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await store.removeWhere('codes', { phone });
  await store.insert('codes', { phone, hash: hash(phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(), tries: 0 });
  if (channel === 'call') {
    const spoken = code.split('').join(', ');
    const say = `Hello. This is Porchlight. Your sign-in code is: ${spoken}. Again, your code is: ${spoken}. Goodbye.`;
    try {
      await sayOnCall(phone, say);
    } catch (e) {
      console.warn('[otp] call failed:', e.message.slice(0, 120));
      throw new HttpError(502, 'We couldn’t call that number. Check it and try again.');
    }
    return { channel: 'call' };
  }
  console.log(`[otp] Development sign-in code for ${phone}: ${code}`);
  return { channel: 'dev', devCode: code };
}

// true when the code is right; throws 400/429 otherwise.
export async function checkCode(phone, code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) throw new HttpError(400, 'Enter the 6-digit code.');
  if (codeChannel(phone) === 'verify') {
    checkLimit(`check:${phone}`, 10, 600000);
    const r = await twilioVerify('VerificationCheck', { To: phone, Code: clean });
    if (r.ok && r.data?.status === 'approved') return true;
    if (r.status === 404) throw new HttpError(400, 'That code has expired. Ask for a new call.');
    throw new HttpError(400, 'That code isn’t right. Check it and try again.');
  }
  const [saved] = await store.list('codes', { phone });
  if (!saved || new Date(saved.expiresAt) < new Date()) throw new HttpError(400, 'That code has expired. Ask for a new call.');
  if (saved.tries >= MAX_TRIES) {
    await store.remove('codes', saved._id);
    throw new HttpError(429, 'Too many wrong codes. Ask for a new call.');
  }
  const a = Buffer.from(saved.hash, 'hex');
  const b = Buffer.from(hash(phone, clean), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await store.update('codes', saved._id, { tries: saved.tries + 1 });
    throw new HttpError(400, 'That code isn’t right. Check it and try again.');
  }
  await store.remove('codes', saved._id);
  return true;
}
