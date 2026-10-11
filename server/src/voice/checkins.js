// OWNER: Person A (voice & AI).
// A check-in conversation: start → turns → finish (analyze, then hand off to care/outcomes.js).
import * as store from '../store.js';
import { reply, analyze, greeting, URGENT_WORDS } from './llm.js';
import { sms } from './notify.js';
import { handleCheckinOutcome } from '../care/outcomes.js';
import { handleIntent, dueReminders } from './intents.js';

export const MAX_TURNS = 10; // a natural chat, not an interrogation; then a kind wrap-up
const BYE = /^\s*(ok(ay)?,? )?(bye|goodbye|talk (to you )?tomorrow)\b/i;
const GOODBYE = /^\s*(no,? )?(that('|’)s (all|it)|nothing else|i('|’)m (all )?(good|fine|set)|bye|goodbye|talk (to you )?tomorrow)\b[\s\S]{0,40}$/i;

// Appointments arrive with B1 (contract seed); until then this is just [].
async function appointmentsFor(seniorId) {
  try { return await store.list('appointments', { seniorId }); } catch { return []; }
}

// Notices (B's collection) that arrived since her last check-in, newest first.
async function newNoticesFor(senior) {
  try {
    const since = senior.lastCheckinAt ? new Date(senior.lastCheckinAt) : new Date(0);
    const all = await store.list('notices', { seniorId: senior._id });
    return all.filter((n) => new Date(n.at || n.createdAt) > since).sort((a, b) => new Date(b.at || b.createdAt) - new Date(a.at || a.createdAt));
  } catch { return []; }
}

export async function startCheckin(seniorId, channel) {
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw new Error('Senior not found');
  const text = greeting(senior, senior.opener, await newNoticesFor(senior), { phone: channel === 'phone', reminders: await dueReminders(senior) });
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
  // Voice actions ("tell Mark…", "put me through to Anne") run before the chat reply; never on an emergency.
  const intent = URGENT_WORDS.test(text) ? null : await handleIntent(senior, checkin, text);
  if (intent?.transfer) {
    transcript.push({ who: 'porchlight', text: intent.reply, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, transferredTo: intent.transfer });
    return { reply: intent.reply, ended: true, transfer: intent.transfer };
  }
  const answer = intent?.reply ?? await reply(senior, transcript, { appointments: await appointmentsFor(senior._id) });
  // Porchlight just told her "I'm letting Anne know right now", so do it now, not after the call.
  if (URGENT_WORDS.test(text) && !checkin.urgentAlertedAt) {
    await alertFamilyNow(senior, text);
    checkin.urgentAlertedAt = new Date().toISOString();
    await store.update('checkins', checkinId, { urgentAlertedAt: checkin.urgentAlertedAt });
  }
  transcript.push({ who: 'porchlight', text: answer, at: new Date().toISOString() });
  await store.update('checkins', checkinId, { transcript });
  const turns = transcript.filter((t) => t.who === 'senior').length;
  // She can end the call herself ("no, that's all", "bye"), unless something is urgent.
  const askedAnythingElse = /anything else|need anything/i.test(checkin.transcript[checkin.transcript.length - 1]?.text || '');
  // Out of turns: never end on a question she can't answer. Say goodbye instead.
  const outOfTurns = turns >= MAX_TURNS && !URGENT_WORDS.test(text);
  if (outOfTurns || (turns >= 2 && (BYE.test(text) || (askedAnythingElse && GOODBYE.test(text))) && !URGENT_WORDS.test(text) && !checkin.urgentAlertedAt)) {
    const bye = `Thank you, ${senior.preferredName}. I'll pass everything on to ${senior.primaryContactName}, and I'll only tell you things once they're confirmed. Talk tomorrow!`;
    transcript[transcript.length - 1] = { who: 'porchlight', text: bye, at: new Date().toISOString() };
    await store.update('checkins', checkinId, { transcript });
    return { reply: bye, ended: true };
  }
  return { reply: answer, ended: turns >= MAX_TURNS };
}

async function alertFamilyNow(senior, said) {
  await store.update('seniors', senior._id, { status: 'help' });
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  for (const m of members.filter((m) => m.role === 'family')) {
    await sms(m, `URGENT: during her check-in call just now ${senior.preferredName} said: "${said}". Please call her now. If you can't reach her, call 911.`);
  }
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
