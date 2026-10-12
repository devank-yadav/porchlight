// "Is this a scam?" by phone: the call asks what happened, judges it, alerts family, and says what to do.
process.env.PERSIST_FILE = 'off';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';
import { startCheckin, addTurn } from './checkins.js';

test('a scam-check call judges what she says and tells her family', async () => {
  await store.connect();
  await store.insert('seniors', { _id: 's1', circleId: 'c1', preferredName: 'Rose', primaryContactName: 'Ann', about: [], meds: [], timezone: 'America/New_York', status: 'ok' });
  await store.insert('members', { _id: 'm1', circleId: 'c1', name: 'Ann Lee', role: 'family', phone: '+15550300001', primary: true });
  const { checkin } = await startCheckin('s1', 'phone', { purpose: 'scam' });
  assert.match(checkin.transcript[0].text, /scam/i);
  const short = await addTurn(checkin._id, 'Hello?');
  assert.match(short.reply, /who was it/i, 'a short answer gets one more question');
  const judged = await addTurn(checkin._id, 'A man said my grandson is in jail and I need to buy gift cards for his bail right now');
  assert.match(judged.reply, /scam/i);
  assert.match(judged.reply, /Ann/);
  assert.equal(judged.ended, false, 'it asks before hanging up');
  const [check] = await store.list('scamChecks', { seniorId: 's1' });
  assert.equal(check.verdict, 'likely scam');
  assert.equal(check.channel, 'call');
  const bye = await addTurn(checkin._id, "No, that's all, thank you");
  assert.equal(bye.ended, true);
});

test('"Help with my phone" by phone: one step at a time, fake warnings flagged once', async () => {
  await store.insert('seniors', { _id: 's2', circleId: 'c2', preferredName: 'Walt', primaryContactName: 'Lucy', about: [], meds: [], timezone: 'America/New_York', status: 'ok' });
  await store.insert('members', { _id: 'm2', circleId: 'c2', name: 'Lucy Park', role: 'family', phone: '+15550300002', primary: true });
  const { checkin } = await startCheckin('s2', 'phone', { purpose: 'tech' });
  assert.match(checkin.transcript[0].text, /screen/i);
  assert.match(checkin.transcript[0].text, /speaker/i, 'tells him to use the speaker to see the screen');
  const first = await addTurn(checkin._id, 'It says software update available');
  assert.match(first.reply, /\?/, 'asks what the screen shows');
  const fake = await addTurn(checkin._id, 'Now a red box says my phone is infected with a virus, call this number');
  assert.match(fake.reply, /don’t call|don't call/i);
  await addTurn(checkin._id, 'It says virus again');
  const checks = await store.list('scamChecks', { seniorId: 's2' });
  assert.equal(checks.length, 1, 'saved once per call');
  assert.equal(checks[0].verdict, 'likely scam');
});
