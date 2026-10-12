// Run: node --test server/src/voice/inbound.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import * as store from '../store.js';
import { seed } from '../care/seed.js';
import { samePhone, whoIsCalling, statusLine, validTwilioSignature, inboundRoutes, endInboundCall } from './inbound.js';
import { addTurn } from './checkins.js';

delete process.env.MONGODB_URI;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.PUBLIC_URL;
await store.connect();
await seed();
const peggy = (await store.list('seniors'))[0];
await store.update('seniors', peggy._id, { phone: '+18145550123' });
const anne = (await store.list('members')).find((m) => m.primary);
await store.update('members', anne._id, { phone: '+18145550456' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(inboundRoutes);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());
const call = async (path, form) => (await fetch(base + path, { method: 'POST', body: new URLSearchParams(form) })).text();

test('phone numbers match however they are written', () => {
  assert.ok(samePhone('+1 (814) 555-0123', '8145550123'));
  assert.ok(samePhone('+18145550123', '18145550123'));
  assert.ok(!samePhone('+18145550123', '+18145550124'));
  assert.ok(!samePhone('', ''));
});

test('callers are recognised: Peggy, her family, or nobody', async () => {
  assert.equal((await whoIsCalling('(814) 555-0123')).kind, 'senior');
  const fam = await whoIsCalling('+18145550456');
  assert.equal(fam.kind, 'family');
  assert.equal(fam.seniors[0]._id, peggy._id);
  assert.equal((await whoIsCalling('+12125550199')).kind, 'unknown');
  assert.equal((await whoIsCalling(undefined)).kind, 'unknown');
});

test('only verified numbers are trusted: a typed-in family number is not, her typed-in number is once she answers a daily call', async () => {
  const mark = (await store.list('members')).find((m) => m._id === 'mark');
  await store.update('members', mark._id, { phone: '+18145550789', accountId: null });
  assert.equal((await whoIsCalling('+18145550789')).kind, 'unknown');

  const ruth = await store.insert('seniors', { name: 'Ruth Test', preferredName: 'Ruth', phone: '+18145550999', accountId: null, circleId: null });
  assert.equal((await whoIsCalling('+18145550999')).kind, 'unknown');
  await store.insert('checkins', { seniorId: ruth._id, channel: 'phone', status: 'completed', transcript: [{ who: 'porchlight', text: 'Hi Ruth' }, { who: 'senior', text: 'Hello' }] });
  assert.equal((await whoIsCalling('+18145550999')).kind, 'senior');
});

test('off by default: the number politely says it is not taking calls', async () => {
  delete process.env.INBOUND_CALLS_ENABLED;
  const out = await call('/twilio/incoming', { From: '+18145550123', CallSid: 'CA0' });
  assert.match(out, /isn&apos;t taking calls yet/);
  assert.equal((await store.list('checkins', { callSid: 'CA0' })).length, 0);
});

test('on: unknown callers hear how to sign up; family hears a status without private details', async () => {
  process.env.INBOUND_CALLS_ENABLED = '1';
  assert.match(await call('/twilio/incoming', { From: '+12125550199' }), /sign up/);
  const fam = await call('/twilio/incoming', { From: '+18145550456' });
  assert.match(fam, /Hi Anne/);
  assert.match(fam, /<Gather/);
  const line = await statusLine({ ...peggy, status: 'ok', lastCheckinAt: new Date().toISOString() });
  assert.match(line, /checked in at/);
  assert.match(await statusLine({ ...peggy, status: 'help' }), /asked for help.*911/);
  assert.doesNotMatch(fam, /cardiolog|Lisinopril|Metformin|Maple/i);
  assert.match(await call('/twilio/incoming/family', { From: '+18145550456', Digits: '1' }), /Gather/);
  assert.match(await call('/twilio/incoming/family', { From: '+18145550456', SpeechResult: 'no thanks' }), /Goodbye/);
});

test('on: Peggy calling in gets her live call; a ride waits for a call back to her own number', async () => {
  process.env.INBOUND_CALLS_ENABLED = '1';
  const out = await call('/twilio/incoming', { From: '+18145550123', CallSid: 'CA1' });
  const [checkin] = await store.list('checkins', { callSid: 'CA1' });
  assert.ok(checkin.inbound);
  assert.match(out, new RegExp(`/twilio/voice\\?checkinId=${checkin._id}`));
  assert.match(checkin.transcript[0].text, /Thanks for calling/);

  const ride = await addTurn(checkin._id, 'Can you book me an Uber to the library?');
  assert.match(ride.reply, /ring you straight back/);
  assert.match(ride.reply, /Shall I hang up now\?/);
  assert.equal((await store.list('actions', { seniorId: peggy._id })).filter((a) => a.title === 'Ride to the library').length, 0);
  assert.equal((await store.list('notices', { seniorId: peggy._id, kind: 'uber' })).length, 0);

  const msg = await addTurn(checkin._id, 'Tell Mark thanks for the milk');
  assert.match(msg.reply, /send that message.*ring you straight back/);

  await call('/twilio/incoming/status', { CallSid: 'CA1', CallStatus: 'completed' });
  assert.equal((await store.get('checkins', checkin._id)).status, 'completed');
  const after = await store.get('seniors', peggy._id);
  assert.equal(after.callbackReason, 'ring-back');
  assert.ok(new Date(after.callbackAt) > new Date());
});

test('a call in she hangs up on at once is closed, not a missed check-in', async () => {
  await store.update('seniors', peggy._id, { status: 'ok', callbackAt: null });
  await call('/twilio/incoming', { From: '+18145550123', CallSid: 'CA2' });
  const [checkin] = await store.list('checkins', { callSid: 'CA2' });
  await endInboundCall(checkin._id);
  assert.equal((await store.get('checkins', checkin._id)).status, 'completed');
  assert.equal((await store.get('seniors', peggy._id)).status, 'ok');
  await endInboundCall('nope'); // unknown ids are ignored
});

test('Twilio signatures are checked when a token is set', () => {
  const token = 'test-token';
  const body = { From: '+18145550123', CallSid: 'CA9' };
  const url = 'https://example.org/twilio/incoming';
  const sig = crypto.createHmac('sha1', token).update(url + 'CallSidCA9From+18145550123').digest('base64');
  const req = (s) => ({ get: () => s, originalUrl: '/twilio/incoming', body });
  assert.ok(validTwilioSignature(req(sig), token, 'https://example.org/'));
  assert.ok(!validTwilioSignature(req('bad'), token, 'https://example.org'));
  assert.ok(validTwilioSignature(req(''), '', 'https://example.org')); // demo mode: nothing to check
});
