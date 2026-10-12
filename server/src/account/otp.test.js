// Test sign-ins: fictional numbers with a fixed code and no call (testers, App Store review).
process.env.PERSIST_FILE = 'off';
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLogins, codeChannel, sendCode, checkCode } from './otp.js';
import { callSenior } from '../voice/schedule.js';
import * as store from '../store.js';

test('TEST_LOGINS: two test numbers in development, none in production unless listed, +1555 only', () => {
  assert.deepEqual([...testLogins({})], [['+15550000001', '123456'], ['+15550000002', '123456']]);
  assert.equal(testLogins({ NODE_ENV: 'production' }).size, 0);
  assert.equal(testLogins({ TEST_LOGINS: 'off' }).size, 0);
  const prod = testLogins({ NODE_ENV: 'production', TEST_LOGINS: '+15550000009=482913, +18145550100=111111, +15550000008=12' });
  assert.deepEqual([...prod], [['+15550000009', '482913']]);
});

test('a test number gets no call and signs in with its fixed code', async () => {
  assert.equal(codeChannel('+15550000001'), 'test');
  assert.deepEqual(await sendCode('+15550000001', 'ip-a'), { channel: 'test', devCode: '123456' });
  // No call, so testers sharing the number aren't held to the per-number resend limit.
  for (let i = 0; i < 6; i++) await sendCode('+15550000002', `ip-${i}`);
  await assert.rejects(checkCode('+15550000001', '654321'), /isn’t right/);
  assert.equal(await checkCode('+15550000001', '123 456'), true);
});

test('Porchlight never dials a test number', async () => {
  await store.connect();
  await store.insert('seniors', { _id: 't1', circleId: 'tc', preferredName: 'Test', phone: '+15550000001' });
  await assert.rejects(callSenior('t1', 'now', 1, { purpose: 'scam' }), /test number/);
  assert.equal((await store.list('checkins', { seniorId: 't1' })).length, 0);
});
