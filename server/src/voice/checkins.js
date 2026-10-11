// OWNER: Person A (voice & AI).
// A check-in conversation: start → turns → finish (analyze, then hand off to care/outcomes.js).
import * as store from '../store.js';
import { reply, analyze, greeting } from './llm.js';
import { handleCheckinOutcome } from '../care/outcomes.js';

export const MAX_TURNS = 6;

// Appointments arrive with B1 (contract seed); until then this is just [].
async function appointmentsFor(seniorId) {
  try { return await store.list('appointments', { seniorId }); } catch { return []; }
}

export async function startCheckin(seniorId, channel) {
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw new Error('Senior not found');
  const text = greeting(senior, senior.opener);
  const checkin = await store.insert('checkins', {
    seniorId, channel, status: 'in-progress', startedAt: new Date().toISOString(),
    transcript: [{ who: 'porchlight', text, at: new Date().toISOString() }],
  });
  await store.update('seniors', seniorId, { status: 'talking' });
  return { senior, checkin };
}

export async function addTurn(checkinId, text) {
  const checkin = await store.get('checkins', checkinId);
  const senior = await store.get('seniors', checkin.seniorId);
  const transcript = [...checkin.transcript, { who: 'senior', text, at: new Date().toISOString() }];
  const answer = await reply(senior, transcript, { appointments: await appointmentsFor(senior._id) });
  transcript.push({ who: 'porchlight', text: answer, at: new Date().toISOString() });
  await store.update('checkins', checkinId, { transcript });
  const turns = transcript.filter((t) => t.who === 'senior').length;
  return { reply: answer, ended: turns >= MAX_TURNS };
}

export async function finishCheckin(checkinId) {
  const checkin = await store.get('checkins', checkinId);
  if (checkin.status === 'completed') return checkin; // idempotent
  const senior = await store.get('seniors', checkin.seniorId);
  const analysis = await analyze(senior, checkin.transcript, { appointments: await appointmentsFor(senior._id) });
  const updated = await store.update('checkins', checkinId, {
    ...analysis, status: 'completed', endedAt: new Date().toISOString(),
  });
  await handleCheckinOutcome(senior, updated, analysis);
  return updated;
}
