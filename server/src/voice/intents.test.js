// Run: node --test server/src/voice/intents.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent, dialableNumber } from './intents.js';

const members = [
  { _id: 'anne', name: 'Anne Hollis', relation: 'Daughter', phone: '+15550100001', primary: true },
  { _id: 'mark', name: 'Mark Hollis', relation: 'Son', phone: '+15550100002' },
  { _id: 'dolores', name: 'Dolores Kim', relation: 'Neighbor, next door', phone: '+15550100003' },
];

test('"tell Mark…" becomes a message to Mark with her words', () => {
  const i = detectIntent('Tell Mark thanks for the milk.', members);
  assert.equal(i.kind, 'message');
  assert.equal(i.member._id, 'mark');
  assert.equal(i.message, 'thanks for the milk');
  assert.equal(detectIntent('Can you let my daughter know that I loved the flowers', members).member._id, 'anne');
});

test('"put me through to Anne" / "can you call my son" become a connect', () => {
  assert.deepEqual(detectIntent('Could you put me through to Anne please', members).member._id, 'anne');
  assert.equal(detectIntent('can you call my son', members).kind, 'connect');
  assert.equal(detectIntent('I want to talk to Dolores', members).member._id, 'dolores');
});

test('ordinary chat is not an intent', () => {
  for (const t of ['Tell me about the garden club', 'Anne said she would call me later', 'My son called yesterday', 'I told Mark already', 'I want to talk about my roses']) {
    assert.equal(detectIntent(t, members), null, t);
  }
});

test('only real numbers are dialed; DEMO_FAMILY_PHONE stands in for the primary caregiver', () => {
  assert.equal(dialableNumber(members[1]), null);
  process.env.DEMO_FAMILY_PHONE = '+18145550000';
  assert.equal(dialableNumber(members[0]), '+18145550000');
  delete process.env.DEMO_FAMILY_PHONE;
});
