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

test('misheard names still find the right person ("Annie", "Marc", "Delores")', () => {
  assert.equal(detectIntent('Can you connect me to Annie?', members).member._id, 'anne');
  assert.equal(detectIntent('Tell Marc thanks for the milk', members).member._id, 'mark');
  assert.equal(detectIntent('I want to talk to Delores', members).member._id, 'dolores');
  assert.equal(detectIntent('Tell Mary hello', members), null);
});

test('"remind me to call the pharmacy tomorrow" → a reminder due tomorrow', async () => {
  const { parseReminder } = await import('./intents.js');
  const now = new Date('2026-10-11T15:00:00Z'); // a Sunday afternoon in New York
  assert.deepEqual(parseReminder('Remind me to call the pharmacy tomorrow.', 'America/New_York', now), { what: 'call the pharmacy', when: 'tomorrow', due: '2026-10-12' });
  assert.equal(parseReminder('Please remind me to water my roses on Wednesday', 'America/New_York', now).due, '2026-10-14');
  assert.equal(parseReminder('remind me to water my roses', 'America/New_York', now).what, 'water your roses');
  assert.equal(parseReminder('remind me to water my roses', 'America/New_York', now).due, null);
  assert.equal(parseReminder('I forgot my keys', 'America/New_York', now), null);
});

test('"call me back later" books a callback; "what do I have this week" reads appointments', async () => {
  const { callbackTime, weekSummary } = await import('./intents.js');
  const now = new Date('2026-10-11T19:00:00Z'); // 3 PM in New York
  assert.equal(callbackTime("I'm busy right now", 'America/New_York', now).toISOString(), '2026-10-11T20:00:00.000Z');
  assert.equal(callbackTime('Can you call me back at 5?', 'America/New_York', now).toISOString(), '2026-10-11T21:00:00.000Z');
  assert.equal(callbackTime('call me back in 20 minutes', 'America/New_York', now).toISOString(), '2026-10-11T19:20:00.000Z');
  assert.equal(callbackTime('I had a busy day in the garden', 'America/New_York', now), null);
  const appts = [{ title: 'Cardiology follow-up', where: 'Valley Heart Clinic (sample)', startsAt: '2026-10-12T18:00:00Z', transport: 'at_risk' }];
  const said = weekSummary(appts, 'America/New_York', now);
  assert.match(said, /cardiology follow-up is tomorrow at 2 PM at Valley Heart Clinic/);
  assert.doesNotMatch(said, /ride is confirmed/);
  assert.match(weekSummary([{ ...appts[0], transport: 'confirmed' }], 'America/New_York', now), /ride is confirmed/);
  assert.match(weekSummary([], 'America/New_York', now), /don't have any appointments/);
});

test('"book an Uber for me" is a ride request', async () => {
  const { RIDE } = await import('./intents.js');
  for (const s of ['Can you book an Uber for me?', 'I need a ride to the doctor', "I don't have a ride", 'get me a taxi']) assert.match(s, RIDE);
  for (const s of ['My son drove me yesterday', 'I rode my bike']) assert.doesNotMatch(s, RIDE);
});

test('ride destination: any place she names, appointment words go to her appointment', async () => {
  const { rideDestination } = await import('./intents.js');
  assert.equal(rideDestination('Book me an Uber to the grocery store'), 'the grocery store');
  assert.equal(rideDestination('Can you get me a ride to my sister\'s house at 4?'), "my sister's house");
  assert.equal(rideDestination('I need a ride to Wegmans now please'), 'Wegmans');
  assert.equal(rideDestination('book an Uber for me'), null);
  // Any place she names, however long; not a fixed list.
  assert.equal(rideDestination("I need an Uber to my friend Ruth's house on Beaver Avenue"), "my friend Ruth's house on Beaver Avenue");
  const { bareDestination } = await import('./intents.js');
  assert.equal(bareDestination('Weis Markets on Westerly Parkway please'), 'Weis Markets on Westerly Parkway');
  assert.equal(bareDestination('From home'), null);
  assert.equal(rideDestination('I need a ride to the doctor tomorrow'), 'the doctor');
});

test('rides: ask where first, take a short answer, remember a place said earlier', async () => {
  const { rideDestination, bareDestination, rideTurn } = await import('./intents.js');
  assert.equal(rideDestination('I want to go to Target'), 'Target');
  assert.equal(rideDestination('Can you book me an Uber?'), null);
  assert.equal(bareDestination('Target'), 'Target');
  assert.equal(bareDestination('I want to go to the library please'), 'the library');
  assert.equal(bareDestination('Yeah.'), null);
  assert.equal(bareDestination("I don't wanna give you that detail"), null);
  const asked = { transcript: [{ who: 'porchlight', text: 'Of course. Where would you like to go?' }] };
  assert.ok(rideTurn('Target', asked));
  assert.ok(!rideTurn('Target', { transcript: [{ who: 'porchlight', text: 'How are you?' }] }));
  assert.ok(rideTurn('Just book me an Uber', { transcript: [] }));
});

test('a sentence is never a ride destination', async () => {
  const { rideDestination } = await import('./intents.js');
  assert.equal(rideDestination('You wanna listen to I just need an Uber.'), null);
  assert.equal(rideDestination('Can you listen to me'), null);
  assert.equal(rideDestination('Take me to the Schlow Library'), 'the Schlow Library');
});

test('filler words are never a place', async () => {
  const { bareDestination } = await import('./intents.js');
  for (const t of ['Listen.', 'Hello?', 'Wait', 'Hold on', 'Sorry?']) assert.equal(bareDestination(t), null, t);
  assert.equal(bareDestination('To Target please.'), 'Target');
});

test('a street address she says is the destination', async () => {
  const { rideDestination } = await import('./intents.js');
  assert.equal(rideDestination("Book me an Uber to my daughter Anne's house at 412 West Foster Avenue"), '412 West Foster Avenue');
  assert.equal(rideDestination('Take me to the Weis Markets please'), 'the Weis Markets');
});
