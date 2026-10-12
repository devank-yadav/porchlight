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
