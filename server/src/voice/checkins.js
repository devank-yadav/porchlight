// OWNER: Person A (voice & AI).
// A check-in conversation: start → turns → finish (analyze, then hand off to care/outcomes.js).
import * as store from '../store.js';
import { reply, analyze, greeting, URGENT_WORDS } from './llm.js';
import { sms } from './notify.js';
import { handleCheckinOutcome } from '../care/outcomes.js';
import { handleIntent, dueReminders } from './intents.js';

const YES = /^\s*(oh,? )?(yes|yeah|yep|sure|okay|ok|please|i('|’)?d (like|love) that|that would be (nice|lovely|great))\b/i;
const CONNECT_ASK = /\b(connect|call|talk to|speak to|put me through)\b/i;
export const MAX_TURNS = 10; // a natural chat, not an interrogation; then a kind wrap-up
const BYE = /^\s*(ok(ay)?,? )?(bye|goodbye|talk (to you )?tomorrow)\b/i;
const GOODBYE = /^\s*(no,? )?(that('|’)s (all|it)|nothing else|i('|’)m (all )?(good|fine|set)|bye|goodbye|talk (to you )?tomorrow)\b[\s\S]{0,40}$/i;

// Appointments arrive with B1 (contract seed); until then this is just [].
async function appointmentsFor(seniorId) {
  try { return await store.list('appointments', { seniorId }); } catch { return []; }
}

// Questions the family asked Porchlight to put to her ("Ask Mom about her first job"), not yet answered.
export function openQuestions(senior) {
  return (senior.familyQuestions || []).filter((q) => !q.answeredAt);
}

// What Porchlight remembers between calls: recent summaries, stories already told, family questions,
// and nearby activities, so a call can pick up threads like a person would.
async function memoryFor(senior) {
  try {
    const past = (await store.list('checkins', { seniorId: senior._id }))
      .filter((c) => c.status === 'completed' && c.summary)
      .sort((a, b) => new Date(b.endedAt || b.startedAt) - new Date(a.endedAt || a.startedAt));
    const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
    const who = (id) => { const m = members.find((x) => x._id === id); return m ? `${m.name.split(' ')[0]}, her ${String(m.relation || 'family').split(',')[0].toLowerCase()}` : 'her family'; };
    const events = await store.list('events', {}).catch(() => []);
    // The activity that best fits what the family told us she loves (garden club for a gardener...).
    const about = (senior.about || []).join(' ').toLowerCase();
    const fit = events.find((e) => (e.tags || []).some((t) => about.includes(t))) || events.find((e) => (e.tags || []).includes('social')) || events[0];
    const clean = (x) => String(x || '').replace(/\s*\(sample\)/i, '');
    return {
      recent: past.slice(0, 2).map((c) => c.summary),
      stories: past.flatMap((c) => (c.stories || []).map((st) => st.title)).slice(0, 8),
      questions: openQuestions(senior).slice(0, 2).map((q) => ({ text: q.text, from: who(q.askedBy) })),
      activity: fit ? { title: fit.title, when: fit.when, where: clean(fit.where).toLowerCase() } : null,
      events: events.slice(0, 4).map((e) => `${e.title} (${e.when}, ${clean(e.where)})`),
    };
  } catch {
    return {};
  }
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

// onSentence (live calls only): sentences of the reply are handed over as they're written; the
// result then has streamed: true and the caller doesn't speak `reply` again.
export async function addTurn(checkinId, text, { onSentence } = {}) {
  const checkin = await store.get('checkins', checkinId);
  const senior = await store.get('seniors', checkin.seniorId);
  const transcript = [...checkin.transcript, { who: 'senior', text, at: new Date().toISOString() }];
  const urgent = URGENT_WORDS.test(text);
  // Voice actions ("tell Mark…", "put me through to Anne") run before the chat reply; never on an emergency.
  const intent = urgent ? null : await handleIntent(senior, checkin, text);
  if (intent?.transfer) {
    transcript.push({ who: 'porchlight', text: intent.reply, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, transferredTo: intent.transfer });
    return { reply: intent.reply, ended: true, transfer: intent.transfer };
  }
  if (intent?.end) { // "call me back later": a kind goodbye, and a callback is booked
    transcript.push({ who: 'porchlight', text: intent.reply, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript });
    return { reply: intent.reply, ended: true };
  }
  // "Yes" to the activity Porchlight just suggested ("Would you like me to tell Anne you'd like to go?"):
  // tell the family now, so the offer is real.
  const lastSaid = checkin.transcript[checkin.transcript.length - 1]?.text || '';
  const activity = /tell \w+ you'd like to go/i.test(lastSaid) && YES.test(text) && !CONNECT_ASK.test(text) ? lastSaid.match(/The (.+?) is (.+?) at the (.+?)\./) : null;
  if (activity) {
    const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
    for (const m of members.filter((x) => x.role === 'family')) {
      await sms(m, `${senior.preferredName} said on her check-in that she's feeling lonely and would like to go to the ${activity[1]} (${activity[2]}, ${activity[3]}). Could someone take her?`);
    }
    const said = `Lovely. I've told ${senior.primaryContactName} you'd like to go to the ${activity[1]}, and someone will let you know about a ride. What else is on your mind today?`;
    transcript.push({ who: 'porchlight', text: said, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, wantsActivity: activity[1] });
    return { reply: said, ended: false };
  }
  const turns = transcript.filter((t) => t.who === 'senior').length;
  // She can end the call herself ("no, that's all", "bye"), unless something is urgent.
  // Out of turns: never end on a question she can't answer. Say goodbye instead.
  const askedAnythingElse = /anything else|need anything/i.test(checkin.transcript[checkin.transcript.length - 1]?.text || '');
  const outOfTurns = turns >= MAX_TURNS && !urgent;
  if (!intent && (outOfTurns || (turns >= 2 && (BYE.test(text) || (askedAnythingElse && GOODBYE.test(text))) && !urgent && !checkin.urgentAlertedAt))) {
    const bye = `Thank you, ${senior.preferredName}. I'll pass everything on to ${senior.primaryContactName}, and I'll only tell you things once they're confirmed. Talk tomorrow!`;
    transcript.push({ who: 'porchlight', text: bye, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript });
    return { reply: bye, ended: true };
  }
  const streamed = !intent && !!onSentence;
  const memory = await memoryFor(senior);
  // Her second answer (after "how are you") is the moment to ask one family question, once per call.
  if (!checkin.askedQuestion && memory.questions?.length && turns >= 2) {
    memory.askNow = memory.questions[0];
    await store.update('checkins', checkinId, { askedQuestion: memory.askNow.text });
  }
  const answer = intent?.reply ?? await reply(senior, transcript, { appointments: await appointmentsFor(senior._id), memory, onSentence });
  // Porchlight just told her "I'm letting Anne know right now", so do it now, not after the call.
  if (urgent && !checkin.urgentAlertedAt) {
    await alertFamilyNow(senior, text);
    await store.update('checkins', checkinId, { urgentAlertedAt: new Date().toISOString() });
  }
  transcript.push({ who: 'porchlight', text: answer, at: new Date().toISOString() });
  await store.update('checkins', checkinId, { transcript });
  return { reply: answer, ended: false, streamed };
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
  const questions = openQuestions(senior);
  const analysis = await analyze(senior, checkin.transcript, { appointments: await appointmentsFor(senior._id), questions });
  // A story that answers a family question closes it, so it isn't asked again.
  const answered = new Set((analysis.stories || []).map((st) => st.question).filter(Boolean));
  if (answered.size) {
    await store.update('seniors', senior._id, {
      familyQuestions: (senior.familyQuestions || []).map((q) => (answered.has(q.text) ? { ...q, answeredAt: new Date().toISOString(), checkinId, answeredCheckinId: checkinId } : q)),
    });
  }
  const updated = await store.update('checkins', checkinId, {
    ...analysis, status: 'completed', endedAt: new Date().toISOString(),
  });
  await handleCheckinOutcome(senior, updated, analysis);
  return updated;
}
