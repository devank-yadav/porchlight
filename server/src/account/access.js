// Sessions and access checks. Every /api route except sign-in needs a session, and only sees the
// care circle its account belongs to.
import { createHash, randomBytes } from 'node:crypto';
import * as store from '../store.js';
import { HttpError } from './errors.js';

const SESSION_DAYS = 180;
const sha = (s) => createHash('sha256').update(s).digest('hex');

export async function createSession(accountId, device = '') {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await store.insert('sessions', {
    tokenHash: sha(token), accountId, device: String(device).slice(0, 80),
    lastSeenAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString(),
  });
  return token;
}

export async function endSession(token) {
  const [s] = await store.list('sessions', { tokenHash: sha(token) });
  if (s) await store.remove('sessions', s._id);
}

const bearer = (req) => (/^Bearer\s+(.+)$/i.exec(req.headers.authorization || '') || [])[1];

// Attaches req.account (and req.token); 401 when signed out or expired.
export async function authenticate(req) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Please sign in.');
  const [s] = await store.list('sessions', { tokenHash: sha(token) });
  if (!s || new Date(s.expiresAt) < new Date()) {
    if (s) await store.remove('sessions', s._id);
    throw new HttpError(401, 'Your sign-in has expired. Please sign in again.');
  }
  const account = await store.get('accounts', s.accountId);
  if (!account) throw new HttpError(401, 'Please sign in.');
  // Sliding expiry, written at most once an hour.
  if (Date.now() - new Date(s.lastSeenAt).getTime() > 3600000) {
    await store.update('sessions', s._id, { lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() });
  }
  req.account = account;
  req.token = token;
  return account;
}

// Express middleware for /api: sign-in routes and the health check are open, the rest need a session.
const OPEN = [/^\/api\/auth\/(start|verify)$/, /^\/api\/health$/];
export function requireSession(req, res, next) {
  if (!req.path.startsWith('/api/') || OPEN.some((r) => r.test(req.path))) return next();
  authenticate(req).then(() => next(), (e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Please sign in.' }));
}

// The senior this account looks after (or is). 403 for anyone else's id; 409 before setup is finished.
export function seniorIdOf(req) {
  if (!req.account.seniorId) throw new HttpError(409, 'Finish setting up first.');
  return req.account.seniorId;
}
export function assertSenior(req, id) {
  if (id !== seniorIdOf(req)) throw new HttpError(403, 'That isn’t in your care circle.');
  return id;
}
// Load a document that belongs to a senior (task, action, check-in) and check it's in this circle.
export async function ownDoc(req, coll, id) {
  const doc = await store.get(coll, id);
  if (!doc || doc.seniorId !== seniorIdOf(req)) throw new HttpError(404, 'Not found.');
  return doc;
}
// The family member acting (null when the older adult is acting on their own phone).
export async function actingMember(req) {
  return req.account.memberId ? store.get('members', req.account.memberId) : null;
}
