// Voice safety tests (Person A). Run: node --test server/src/voice/llm.test.js
// Runs against the rule-based fallback; keep LLM_* unset when running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { policyReply, guardReply, reply, analyze, greeting, scamCheck } from './llm.js';

const peggy = { _id: 'peggy', preferredName: 'Peggy', primaryContactName: 'Anne', meds: [{ name: 'blood pressure pill', when: 'morning' }], about: [], age: 82, city: 'Dayton' };
const tomorrow = [{ title: 'Cardiology follow-up', with: 'Dr. Lena Ortiz (sample)', where: 'Valley Heart Clinic (sample)', startsAt: new Date(Date.now() + 864e5).toISOString(), transport: 'unknown' }];
const kind = (r) => (!r ? null : /911/.test(r) ? 'urgent' : /scam/.test(r) ? 'scam' : /ride/.test(r) ? 'ride' : 'meds');
const convo = (...said) => [{ who: 'porchlight', text: 'hi' }, ...said.map((text) => ({ who: 'senior', text }))];

test('policy replies fire on real signals', () => {
  for (const [text, want] of [
    ['I fell in the kitchen', 'urgent'], ["I've fallen and can't get up", 'urgent'], ['I had a fall yesterday', 'urgent'], ['My chest hurts', 'urgent'],
    ['The IRS called about a warrant', 'scam'], ['He wants gift cards', 'scam'], ['They asked for my verification code', 'scam'],
    ['My grandson is in trouble and needs bail money', 'scam'], ["I don't have a ride to the doctor", 'ride'],
    ["I'm not sure if I took my blood pressure pill", 'meds'], ["I can't remember if I took my pills", 'meds'],
  ]) assert.equal(kind(policyReply(peggy, text)), want, text);
});

test('no false alarms on everyday talk', () => {
  for (const text of ['I went up the stairs first thing', 'I fell asleep in my chair', 'In the fall I plant bulbs', 'The lamp is wired wrong', 'I took my pill with breakfast', 'My friend gave me a ride to church'])
    assert.equal(policyReply(peggy, text), null, text);
});

test('replies never claim a booking or ask for codes', async () => {
  for (const text of ["I don't have a ride", 'Can someone drive me to the dentist?', 'A man asked for my bank account number']) {
    const r = await reply(peggy, convo(text), { appointments: tomorrow });
    assert.doesNotMatch(r, /\b(booked|arranged|is confirmed|scheduled)\b/i, r);
    assert.doesNotMatch(r, /(what('|’)s|tell me) your/i, r);
  }
});

test('guard blocks unsafe model output', () => {
  for (const t of ["I've booked a ride for you tomorrow.", 'Your ride is confirmed!', 'Can you tell me your PIN?', 'You might have a stroke.', 'Take another pill to be safe.'])
    assert.equal(guardReply(peggy, t), null, t);
  assert.ok(guardReply(peggy, 'That sounds lovely. What did you plant?'));
});

test('demo call analysis matches the contract', async () => {
  const a = await analyze(peggy, convo("I'm good. A man called about gift cards, I hung up", "I don't have a ride to the heart doctor tomorrow", "And I'm out of milk"), { appointments: tomorrow });
  assert.ok(a.flags.some((f) => f.type === 'scam'));
  const ride = a.requests.find((r) => r.type === 'ride');
  assert.equal(ride.blocker, true);
  assert.match(ride.quote, /ride/);
  const milk = a.requests.find((r) => r.type === 'groceries');
  assert.equal(milk.quote, "And I'm out of milk");
  for (const r of a.requests) assert.ok(r.quote, 'every request has a quote');
  assert.ok(['taken', 'not_taken', 'unsure', 'no_answer'].includes(a.medStatus));
});

test('meds unsure → medStatus unsure + flag, never an extra dose', async () => {
  const t = convo("I'm not sure if I took my blood pressure pill");
  const a = await analyze(peggy, t);
  assert.equal(a.medStatus, 'unsure');
  assert.ok(a.flags.some((f) => f.type === 'meds_unsure'));
  assert.match(await reply(peggy, t), /don't take an extra/);
});

test('greeting says it is an AI and reads confirmed notices only', () => {
  const g = greeting(peggy, null, [{ text: 'Mark is bringing your milk Thursday' }]);
  assert.match(g, /I'm an AI/);
  assert.match(g, /never ask you for money or codes/);
  assert.match(g, /Mark is bringing your milk Thursday\./);
});

test('scam check: everyday words are fine, real scams are caught', async () => {
  assert.equal((await scamCheck("My first grandson called, I won't worry, it was wonderful shopping")).verdict, 'probably fine');
  assert.equal((await scamCheck('Someone said I won a prize and must pay with gift cards')).verdict, 'likely scam');
  assert.equal((await scamCheck('My grandson is in jail and needs bail money, keep it secret')).verdict, 'likely scam');
});
