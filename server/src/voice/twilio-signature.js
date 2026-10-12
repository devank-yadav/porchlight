// Twilio webhooks must really come from Twilio: check X-Twilio-Signature (HMAC-SHA1 of the full URL
// plus the sorted POST fields, keyed with the auth token). Skipped when Twilio isn't configured, and
// with TWILIO_SKIP_SIGNATURE=1 (local testing through a proxy that rewrites URLs).
import { createHmac, timingSafeEqual } from 'node:crypto';

export function twilioSignature(token, url, params = {}) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function checkTwilioSignature(req, res, next) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.PUBLIC_URL?.replace(/\/$/, '');
  if (!token || !base || process.env.TWILIO_SKIP_SIGNATURE === '1') return next();
  const given = String(req.get('X-Twilio-Signature') || '');
  const expected = twilioSignature(token, base + req.originalUrl, req.method === 'POST' ? req.body || {} : {});
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return next();
  console.warn(`[twilio] Rejected a webhook with a bad signature: ${req.method} ${req.path}`);
  res.status(403).send('Forbidden');
}
