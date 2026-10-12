// Accounts and care circles.
// One phone number = one account with one role, chosen at sign-up and never changed:
//   'senior'  the older adult, on their own phone;
//   'family'  a family member, friend or neighbor who helps.
// A care circle is one older adult (a `seniors` doc) and the people around them (`members` docs), sharing a circleId.
// Either side can start it:
//   - the older adult sets up, then shares an invite code with family;
//   - a family member sets it up for their parent (name + phone). Calls work right away, and when the
//     parent installs Porchlight and signs in with that number, they're offered that circle.
// A family member joins with an invite code, or is offered the circle when someone already added their number.
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import * as store from '../store.js';
import { wrap } from '../wrap.js';
import { HttpError } from './errors.js';
import { sendCode, checkCode, checkLimit, codeChannel } from './otp.js';
import { createSession, endSession, seniorIdOf } from './access.js';
import * as audit from '../care/audit.js';

export const accountRoutes = Router();

const ROLES = ['senior', 'family'];
const RELATIONS_MAX = 40;
const INVITE_DAYS = 7;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// "(814) 555-0123" / "814 555 0123" / "+44 20 …" → E.164. US numbers may skip the +1.
export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  const e164 = s.startsWith('+') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null;
  if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) throw new HttpError(400, 'Enter a full phone number, like (814) 555-0123.');
  return e164;
}

const text = (v, max, label) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (!t && label) throw new HttpError(400, `Please add ${label}.`);
  return t;
};
const validZone = (tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'America/New_York'; }
};
const firstName = (name) => String(name || '').split(' ')[0];

// What the app knows about who is signed in.
async function meOf(account) {
  const senior = account.seniorId ? await store.get('seniors', account.seniorId) : null;
  const out = {
    id: account._id, role: account.role, name: account.name || '', phone: account.phone,
    seniorId: account.seniorId || null, memberId: account.memberId || null,
    setupDone: Boolean(account.name && account.seniorId),
    seniorName: senior?.preferredName || null,
  };
  if (!out.setupDone) out.offers = await offersFor(account);
  return out;
}

// Circles that already have this phone number in them, waiting for this person to say yes.
async function offersFor(account) {
  if (account.role === 'senior') {
    const seniors = (await store.list('seniors', { phone: account.phone })).filter((s) => !s.accountId);
    return Promise.all(seniors.map(async (s) => {
      const by = s.createdBy ? await store.get('members', s.createdBy) : null;
      return { kind: 'senior', id: s._id, name: s.preferredName, by: by ? firstName(by.name) : null };
    }));
  }
  const members = (await store.list('members', { phone: account.phone })).filter((m) => !m.accountId && m.circleId);
  return (await Promise.all(members.map(async (m) => {
    const [senior] = await store.list('seniors', { circleId: m.circleId });
    return senior ? { kind: 'member', id: m._id, name: senior.preferredName, relation: m.relation } : null;
  }))).filter(Boolean);
}

// The primary contact's first name is what Porchlight says on calls ("I'll let Anne know").
export async function syncPrimary(circleId) {
  const members = await store.list('members', { circleId });
  let primary = members.find((m) => m.primary);
  const family = members.filter((m) => m.role === 'family');
  if (!primary && family.length) {
    primary = await store.update('members', family[0]._id, { primary: true, canApprove: true, seesMeds: true });
  }
  const [senior] = await store.list('seniors', { circleId });
  if (senior) await store.update('seniors', senior._id, { primaryContactName: primary ? firstName(primary.name) : 'your family' });
}

async function newSenior({ circleId, preferredName, name, phone, timezone, home, accountId = null, createdBy = null }) {
  return store.insert('seniors', {
    circleId, name: name || preferredName, preferredName, phone, timezone, home: home || '',
    accountId, createdBy, about: [], meds: [], status: 'waiting', checkinTime: '10:00', autoCall: false,
    primaryContactName: 'your family',
  });
}

// ---------- Sign in ----------
accountRoutes.post('/api/auth/start', wrap(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose who this phone is for first.');
  const [existing] = await store.list('accounts', { phone });
  if (existing && existing.role !== role) {
    throw new HttpError(409, existing.role === 'senior'
      ? 'This number is already set up for an older adult. Each number has one kind of account.'
      : 'This number is already set up for a family member. Each number has one kind of account.');
  }
  const sent = await sendCode(phone, req.ip);
  res.json({ phone, ...sent, existing: Boolean(existing) });
}));

accountRoutes.post('/api/auth/verify', wrap(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose who this phone is for first.');
  checkLimit(`verify-ip:${req.ip}`, 60, 3600000);
  await checkCode(phone, req.body?.code);
  let [account] = await store.list('accounts', { phone });
  if (account && account.role !== role) throw new HttpError(409, 'This number already has a different kind of account.');
  if (!account) account = await store.insert('accounts', { phone, role, name: '', seniorId: null, memberId: null, circleId: null });
  const token = await createSession(account._id, req.body?.device);
  await audit.log(account._id, 'auth.signin', { seniorId: account.seniorId, detail: codeChannel(phone) });
  res.json({ token, me: await meOf(account) });
}));

accountRoutes.post('/api/auth/logout', wrap(async (req, res) => {
  await endSession(req.token);
  res.json({ ok: true });
}));

accountRoutes.get('/api/me', wrap(async (req, res) => res.json(await meOf(req.account))));

// ---------- Setup: older adult ----------
// { preferredName, name?, timezone, home?, join?: seniorId offered to this number }
accountRoutes.post('/api/setup/senior', wrap(async (req, res) => {
  const a = req.account;
  if (a.role !== 'senior') throw new HttpError(403, 'This phone is set up for a family member.');
  if (a.seniorId) return res.json(await meOf(a));
  const preferredName = text(req.body?.preferredName, 40, 'your first name');
  const timezone = validZone(req.body?.timezone);
  let senior;
  if (req.body?.join) {
    senior = await store.get('seniors', req.body.join);
    if (!senior || senior.phone !== a.phone || senior.accountId) throw new HttpError(404, 'That invitation isn’t available any more.');
    senior = await store.update('seniors', senior._id, { accountId: a._id, preferredName, timezone, ...(req.body?.home ? { home: text(req.body.home, 200) } : {}) });
  } else {
    senior = await newSenior({ circleId: store.newId(), preferredName, name: text(req.body?.name, 80) || preferredName, phone: a.phone, timezone, home: text(req.body?.home, 200), accountId: a._id });
  }
  const updated = await store.update('accounts', a._id, { name: preferredName, timezone, seniorId: senior._id, circleId: senior.circleId });
  await audit.log(a._id, 'setup.senior', { seniorId: senior._id, detail: req.body?.join ? 'joined a circle family started' : 'new circle' });
  res.json(await meOf(updated));
}));

// ---------- Setup: family ----------
// Step 1, { name, timezone }: who you are.
accountRoutes.post('/api/setup/family', wrap(async (req, res) => {
  const a = req.account;
  if (a.role !== 'family') throw new HttpError(403, 'This phone is set up for an older adult.');
  const name = text(req.body?.name, 80, 'your name');
  const updated = await store.update('accounts', a._id, { name, timezone: validZone(req.body?.timezone) });
  if (a.memberId) await store.update('members', a.memberId, { name });
  res.json(await meOf(updated));
}));

async function addSelfToCircle(account, circleId, relation, { primary = false, memberId = null } = {}) {
  const fields = { circleId, name: account.name, relation: text(relation, RELATIONS_MAX) || 'Family', role: 'family', phone: account.phone, timezone: account.timezone || 'America/New_York', accountId: account._id };
  const member = memberId
    ? await store.update('members', memberId, fields)
    : await store.insert('members', { ...fields, primary, canApprove: primary, seesMeds: primary });
  const [senior] = await store.list('seniors', { circleId });
  await syncPrimary(circleId);
  return store.update('accounts', account._id, { circleId, seniorId: senior._id, memberId: member._id });
}

// Step 2a, { preferredName, phone, home?, timezone?, relation }: set Porchlight up for your parent.
accountRoutes.post('/api/setup/family/parent', wrap(async (req, res) => {
  const a = req.account;
  if (a.role !== 'family' || !a.name) throw new HttpError(400, 'Add your name first.');
  if (a.seniorId) throw new HttpError(409, 'You’re already in a care circle.');
  const phone = normalizePhone(req.body?.phone);
  if (phone === a.phone) throw new HttpError(400, 'That’s your own number. Enter your parent’s phone number.');
  const [taken] = (await store.list('seniors', { phone })).filter((s) => s.accountId);
  if (taken) throw new HttpError(409, `${taken.preferredName} already uses Porchlight. Ask them for an invite code from their Family page.`);
  const circleId = store.newId();
  const member = await store.insert('members', { circleId, name: a.name, relation: '', role: 'family', phone: a.phone, timezone: a.timezone, accountId: a._id, primary: true, canApprove: true, seesMeds: true });
  const senior = await newSenior({
    circleId, preferredName: text(req.body?.preferredName, 40, 'their first name'), phone,
    timezone: validZone(req.body?.timezone || a.timezone), home: text(req.body?.home, 200), createdBy: member._id,
  });
  const updated = await addSelfToCircle(a, circleId, req.body?.relation, { memberId: member._id });
  await audit.log(a._id, 'setup.family.parent', { seniorId: senior._id });
  res.json(await meOf(updated));
}));

// Step 2b, { code, relation } or { memberId, relation }: join an existing circle.
accountRoutes.post('/api/setup/family/join', wrap(async (req, res) => {
  const a = req.account;
  if (a.role !== 'family' || !a.name) throw new HttpError(400, 'Add your name first.');
  if (a.seniorId) throw new HttpError(409, 'You’re already in a care circle.');
  let circleId;
  let memberId = null;
  if (req.body?.memberId) {
    const m = await store.get('members', req.body.memberId);
    if (!m || m.phone !== a.phone || m.accountId) throw new HttpError(404, 'That invitation isn’t available any more.');
    circleId = m.circleId;
    memberId = m._id;
  } else {
    checkLimit(`join:${a._id}`, 10, 3600000);
    const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [invite] = await store.list('invites', { code });
    if (!invite || new Date(invite.expiresAt) < new Date()) throw new HttpError(404, 'That code didn’t work. Check it, or ask for a new one.');
    circleId = invite.circleId;
    await store.update('invites', invite._id, { uses: (invite.uses || 0) + 1 });
  }
  const [senior] = await store.list('seniors', { circleId });
  if (!senior) throw new HttpError(404, 'That care circle no longer exists.');
  const updated = await addSelfToCircle(a, circleId, req.body?.relation, { memberId });
  await audit.log(a._id, 'setup.family.join', { seniorId: senior._id });
  res.json(await meOf(updated));
}));

// ---------- The circle ----------
async function myCircle(req) {
  const seniorId = seniorIdOf(req);
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw new HttpError(404, 'Not found.');
  const me = req.account.memberId ? await store.get('members', req.account.memberId) : null;
  // Who can change the circle: the older adult, and the primary family contact.
  const manager = req.account.role === 'senior' || Boolean(me?.primary);
  return { senior, me, manager };
}

// An invite code to share. Anyone in the circle can make one; codes last a week.
accountRoutes.post('/api/circle/invites', wrap(async (req, res) => {
  const { senior } = await myCircle(req);
  checkLimit(`invite:${req.account._id}`, 20, 3600000);
  let code;
  do code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
  while ((await store.list('invites', { code })).length);
  const invite = await store.insert('invites', { code, circleId: senior.circleId, createdBy: req.account._id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString(), uses: 0 });
  res.json({ code: invite.code, expiresAt: invite.expiresAt });
}));

// Add someone by phone (a family member or neighbor, with or without the app): they get circle
// messages, and when they sign in with that number they're offered the circle.
accountRoutes.post('/api/circle/members', wrap(async (req, res) => {
  const { senior, manager } = await myCircle(req);
  if (!manager) throw new HttpError(403, 'Only the primary contact can add people.');
  const phone = normalizePhone(req.body?.phone);
  const members = await store.list('members', { circleId: senior.circleId });
  if (members.some((m) => m.phone === phone)) throw new HttpError(409, 'That number is already in the circle.');
  if (phone === senior.phone) throw new HttpError(400, `That’s ${senior.preferredName}’s own number.`);
  const role = req.body?.role === 'neighbor' ? 'neighbor' : 'family';
  const member = await store.insert('members', {
    circleId: senior.circleId, name: text(req.body?.name, 80, 'a name'), relation: text(req.body?.relation, RELATIONS_MAX) || (role === 'neighbor' ? 'Neighbor' : 'Family'),
    role, phone, timezone: senior.timezone, accountId: null, primary: false, canApprove: false, seesMeds: false,
  });
  await syncPrimary(senior.circleId);
  await audit.log(req.account._id, 'circle.add', { seniorId: senior._id, targetId: member._id });
  res.json(member);
}));

// { canApprove, seesMeds, primary, relation }
accountRoutes.patch('/api/circle/members/:id', wrap(async (req, res) => {
  const { senior, manager } = await myCircle(req);
  if (!manager) throw new HttpError(403, 'Only the primary contact can change this.');
  const m = await store.get('members', req.params.id);
  if (!m || m.circleId !== senior.circleId) throw new HttpError(404, 'Not found.');
  const patch = {};
  for (const k of ['canApprove', 'seesMeds']) if (typeof req.body?.[k] === 'boolean') patch[k] = req.body[k];
  if (req.body?.relation !== undefined) patch.relation = text(req.body.relation, RELATIONS_MAX);
  if (req.body?.primary === true && m.role === 'family') {
    for (const other of await store.list('members', { circleId: senior.circleId })) if (other.primary) await store.update('members', other._id, { primary: false });
    Object.assign(patch, { primary: true, canApprove: true, seesMeds: true });
  }
  const updated = await store.update('members', m._id, patch);
  await syncPrimary(senior.circleId);
  await audit.log(req.account._id, 'circle.edit', { seniorId: senior._id, targetId: m._id, detail: Object.keys(patch).join(',') });
  res.json(updated);
}));

accountRoutes.delete('/api/circle/members/:id', wrap(async (req, res) => {
  const { senior, manager } = await myCircle(req);
  const m = await store.get('members', req.params.id);
  if (!m || m.circleId !== senior.circleId) throw new HttpError(404, 'Not found.');
  if (!manager) throw new HttpError(403, 'Only the primary contact can remove people.');
  if (m.accountId === req.account._id) throw new HttpError(400, 'To leave, delete your account in Settings.');
  await removeMember(m);
  await audit.log(req.account._id, 'circle.remove', { seniorId: senior._id, targetId: m._id });
  res.json({ ok: true });
}));

async function removeMember(m) {
  if (!m) return;
  await store.remove('members', m._id);
  if (m.accountId) await store.update('accounts', m.accountId, { circleId: null, seniorId: null, memberId: null });
  await syncPrimary(m.circleId);
}

// The older adult's profile: { preferredName, home, about: [..], timezone, phone (family-made only) }.
accountRoutes.patch('/api/senior', wrap(async (req, res) => {
  const { senior, manager } = await myCircle(req);
  if (!manager) throw new HttpError(403, 'Only the primary contact can change this.');
  const patch = {};
  if (req.body?.preferredName !== undefined) patch.preferredName = text(req.body.preferredName, 40, 'a first name');
  if (req.body?.home !== undefined) patch.home = text(req.body.home, 200);
  if (req.body?.timezone !== undefined) patch.timezone = validZone(req.body.timezone);
  if (Array.isArray(req.body?.about)) patch.about = req.body.about.map((x) => text(x, 200)).filter(Boolean).slice(0, 20);
  if (req.body?.phone !== undefined && !senior.accountId) patch.phone = normalizePhone(req.body.phone);
  const updated = await store.update('seniors', senior._id, patch);
  await audit.log(req.account._id, 'senior.edit', { seniorId: senior._id, detail: Object.keys(patch).join(',') });
  res.json(updated);
}));

// This phone's push token (family phones get circle alerts; the older adult's phone gets ride buttons).
accountRoutes.post('/api/me/push-token', wrap(async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new HttpError(400, 'Not an Expo push token.');
  const a = req.account;
  if (a.role === 'senior' && a.seniorId) await store.update('seniors', a.seniorId, { pushToken: token });
  if (a.memberId) await store.update('members', a.memberId, { pushToken: token });
  res.json({ ok: true });
}));

// ---------- Delete account ----------
// Family: removes you from the circle. Older adult: removes them and everything about them
// (calls, stories, tasks, medicines, rides), and the family's access to it.
// A family member who set the circle up for a parent without the app, and is the last family member, deletes it too.
const SENIOR_DATA = ['audit', 'checkins', 'tasks', 'escalations', 'scamChecks', 'appointments', 'actions', 'notices', 'doses'];
async function deleteSeniorData(senior) {
  for (const c of SENIOR_DATA) await store.removeWhere(c, { seniorId: senior._id });
  for (const inv of await store.list('invites', { circleId: senior.circleId })) await store.remove('invites', inv._id);
  for (const m of await store.list('members', { circleId: senior.circleId })) {
    await store.remove('members', m._id);
    if (m.accountId) await store.update('accounts', m.accountId, { circleId: null, seniorId: null, memberId: null });
  }
  await store.remove('seniors', senior._id);
}

accountRoutes.delete('/api/me', wrap(async (req, res) => {
  const a = req.account;
  const senior = a.seniorId ? await store.get('seniors', a.seniorId) : null;
  if (a.role === 'senior' && senior) await deleteSeniorData(senior);
  if (a.role === 'family' && senior) {
    const others = (await store.list('members', { circleId: senior.circleId })).filter((m) => m.role === 'family' && m.accountId && m.accountId !== a._id);
    if (!senior.accountId && !others.length) await deleteSeniorData(senior);
    else if (a.memberId) await removeMember(await store.get('members', a.memberId));
  }
  await store.removeWhere('sessions', { accountId: a._id });
  await store.remove('accounts', a._id);
  await store.removeWhere('audit', { actor: a._id });
  console.log('[account] An account was deleted.');
  res.json({ ok: true });
}));
