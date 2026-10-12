// OWNER: Person A (voice & AI).
// A check-in conversation: start → turns → finish (analyze, then hand off to care/outcomes.js).
import * as store from '../store.js';
import { reply, analyze, greeting, scamCheck, techTalk, URGENT_WORDS } from './llm.js';
import { sms } from './notify.js';
import { handleCheckinOutcome } from '../care/outcomes.js';
import { medsDueNow, doseLine } from '../care/meds.js';
import { forecast, cachedForecast } from './weather.js';
import { handleIntent, dueReminders, localDate } from './intents.js';

const YES = /^\s*(oh,? )?(yes|yeah|yep|sure|okay|ok|please|i('|’)?d (like|love) that|that would be (nice|lovely|great))\b/i;
const CONNECT_ASK = /\b(connect|call|talk to|speak to|put me through)\b/i;
export const MAX_TURNS = 10; // kept for callers; calls no longer end on a turn count
// Every LONG_CALL turns Porchlight gently asks whether she'd like to keep going; it never just hangs up.
const LONG_CALL = 20;
// Her yes to "shall we say goodbye?": short, and not a new request ("no, but can you…" keeps talking).
const CONFIRM_END = /^\s*(oh,? )?(yes|yeah|yep|ok(ay)?|sure|alright|that('|’)s (all|it|fine)|no,? (that('|’)s all|thanks?|thank you|nothing)|nope|nothing( else)?|bye|good ?bye|good night|i('|’)m (good|done|fine|all set)|go ahead|you can (go|hang up)|please do|hang up)\b(?![\s\S]*\b(but|can you|could you|wait|actually|one more)\b)[\s\S]{0,40}$/i;
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
    const events = senior.circleId ? await store.list('events', { circleId: senior.circleId }).catch(() => []) : [];
    // The activity that best fits what the family told us she loves (garden club for a gardener...).
    const about = (senior.about || []).join(' ').toLowerCase();
    const fit = events.find((e) => (e.tags || []).some((t) => about.includes(t))) || events.find((e) => (e.tags || []).includes('social')) || events[0];
    return {
      recent: past.slice(0, 2).map((c) => c.summary),
      stories: past.flatMap((c) => (c.stories || []).map((st) => st.title)).slice(0, 8),
      questions: openQuestions(senior).slice(0, 2).map((q) => ({ text: q.text, from: who(q.askedBy) })),
      activity: fit ? { title: fit.title, when: fit.when, where: String(fit.where || '').toLowerCase() } : null,
      weather: cachedForecast(senior.timezone || 'America/New_York', senior.homeLatLng),
      events: events.slice(0, 4).map((e) => `${e.title} (${e.when}, ${e.where})`),
      medsDue: (await medsDueNow(senior).catch(() => [])).map(doseLine),
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
    // Read-aloud news only: an Uber button notice is an on-screen instruction, not news.
    return all.filter((n) => n.kind !== 'uber' && new Date(n.at || n.createdAt) > since).sort((a, b) => new Date(b.at || b.createdAt) - new Date(a.at || a.createdAt));
  } catch { return []; }
}

// purpose 'scam': she tapped "Is this a scam?". The call asks what happened, judges it, and says what to do.
// purpose 'tech': she tapped "Help with my phone". The call asks what's on the screen and goes one step at a time.
export async function startCheckin(seniorId, channel, { purpose = 'checkin' } = {}) {
  const senior = await store.get('seniors', seniorId);
  if (!senior) throw new Error('Senior not found');
  forecast(senior.timezone, senior.homeLatLng).catch(() => {}); // warm the weather cache so the first question about it is instant
  const text = purpose === 'scam'
    ? `Hi ${senior.preferredName}, it's Porchlight, your AI helper. You asked me to check something that might be a scam. Tell me what happened: who contacted you, and what did they want?`
    : purpose === 'tech'
      ? `Hi ${senior.preferredName}, it's Porchlight, your AI helper. Let's sort out your screen together. If it's this phone, tap the speaker button so you can see it while we talk. What does the screen say?`
      : greeting(senior, senior.opener, await newNoticesFor(senior), { phone: channel === 'phone', reminders: await dueReminders(senior) });
  const checkin = await store.insert('checkins', {
    seniorId, channel, purpose, statusBefore: senior.status || 'waiting', status: 'in-progress', startedAt: new Date().toISOString(),
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
  // A scam-check call: her first full answer is judged, then she hears the verdict and what to do.
  if (checkin.purpose === 'scam' && !checkin.scamCheckId && !urgent) {
    const said = transcript.filter((t) => t.who === 'senior').map((t) => t.text).join(' ');
    // A very short first answer ("hello?", "yes") gets one more question before judging.
    if (said.split(/\s+/).length < 6 && transcript.filter((t) => t.who === 'senior').length < 2) {
      const ask = 'Take your time. Who was it, and what did they ask you to do?';
      transcript.push({ who: 'porchlight', text: ask, at: new Date().toISOString() });
      await store.update('checkins', checkinId, { transcript });
      return { reply: ask, ended: false };
    }
    const result = await scamCheck(said.slice(0, 2000));
    const saved = await store.insert('scamChecks', { seniorId: senior._id, description: said.slice(0, 2000), channel: 'call', checkinId, ...result });
    const family = senior.circleId ? (await store.list('members', { circleId: senior.circleId })).filter((m) => m.role === 'family') : [];
    if (result.verdict !== 'probably fine') {
      for (const m of family) await sms(m, `${senior.preferredName} asked Porchlight about a suspicious contact (${result.verdict}): "${said.slice(0, 140)}". Worth a call today.`);
    }
    const head = result.verdict === 'likely scam' ? 'That sounds like a scam.' : result.verdict === 'be careful' ? 'Please be careful with this one.' : 'That sounds okay to me.';
    const told = result.verdict !== 'probably fine' && family.length ? ` I've let ${senior.primaryContactName || 'your family'} know.` : '';
    const say = `${head} ${result.advice}${told} Is there anything else about it you'd like to ask, or shall we say goodbye?`;
    transcript.push({ who: 'porchlight', text: say, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, scamCheckId: saved._id, askedToEnd: true });
    return { reply: say, ended: false };
  }
  // Voice actions ("tell Mark…", "put me through to Anne") run before the chat reply; never on an emergency.
  // "Yes" to Porchlight's own offer ("Would you like me to connect you to Anne?") is a real request to connect.
  const lastQuestion = ([...checkin.transcript].reverse().find((t) => t.who === 'porchlight')?.text.match(/[^.?!]*\?/g) || []).at(-1) || '';
  // "connect you to Mark?", "connect you to her?", "Shall I connect you now?" (no name → her first contact)
  const offered = lastQuestion.match(/\b(?:connect you|put you through|call)\b(?:\s+(?:to|with))?\s*(\w+)?/i);
  const named = offered?.[1] && !/^(her|him|them|now|right|there|back|in|over)$/i.test(offered[1]) ? offered[1] : null;
  const offeredTo = offered && (named || senior.primaryContactName);
  const acceptsOffer = offeredTo && YES.test(text) && !/\b(no|not|don'?t)\b/i.test(text);
  const intent = urgent ? null : await handleIntent(senior, checkin, acceptsOffer ? `Connect me to ${offeredTo}` : text);
  if (intent?.transfer) {
    transcript.push({ who: 'porchlight', text: intent.reply, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, transferredTo: intent.transfer });
    return { reply: intent.reply, ended: true, transfer: intent.transfer };
  }
  if (intent?.end) { // "call me back later": the callback is booked; still ask before hanging up
    const ask = `${intent.reply.replace(/\s*Bye for now!?\s*$/i, '')} Shall I hang up now?`;
    transcript.push({ who: 'porchlight', text: ask, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, askedToEnd: true });
    return { reply: ask, ended: false };
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
  // Porchlight never hangs up on its own. When she sounds done ("that's all", "bye"), or after a long
  // chat, it ASKS; the call ends only when she says yes to that question.
  if (checkin.askedToEnd && !intent && !urgent) {
    if (CONFIRM_END.test(text)) {
      const later = checkin.callbackAt ? 'Talk to you soon!' : 'Talk tomorrow!';
      const bye = `Thank you, ${senior.preferredName}. I'll pass everything on to ${senior.primaryContactName}, and I'll only tell you things once they're confirmed. ${later}`;
      transcript.push({ who: 'porchlight', text: bye, at: new Date().toISOString() });
      await store.update('checkins', checkinId, { transcript, askedToEnd: false });
      return { reply: bye, ended: true };
    }
    await store.update('checkins', checkinId, { askedToEnd: false }); // she wants to keep talking
    checkin.askedToEnd = false;
  } else if (!intent && !urgent && !checkin.urgentAlertedAt && turns >= 2
    && (BYE.test(text) || GOODBYE.test(text) || (turns >= LONG_CALL && turns % LONG_CALL === 0))) {
    const ask = turns >= LONG_CALL && !BYE.test(text) && !GOODBYE.test(text)
      ? `I've loved chatting, ${senior.preferredName}. Is there anything else you'd like to talk about, or shall we say goodbye for today?`
      : `Before I let you go, is there anything else you need? Or shall we say goodbye for today?`;
    transcript.push({ who: 'porchlight', text: ask, at: new Date().toISOString() });
    await store.update('checkins', checkinId, { transcript, askedToEnd: true });
    return { reply: ask, ended: false };
  }
  const streamed = !intent && !!onSentence;
  const memory = await memoryFor(senior);
  // Her second answer (after "how are you") is the moment to ask one family question, once per call.
  if (!checkin.askedQuestion && memory.questions?.length && turns >= 2) {
    memory.askNow = memory.questions[0];
    await store.update('checkins', checkinId, { askedQuestion: memory.askNow.text });
  }
  if (checkin.purpose === 'tech' && !intent && !urgent) return techTurn(senior, checkin, transcript);
  const answer = intent?.reply ?? await reply(senior, transcript, { appointments: await appointmentsFor(senior._id), memory, onSentence });
  await followUps(senior, checkin, text, answer);
  // Porchlight just told her "I'm letting Anne know right now", so do it now, not after the call.
  if (urgent && !checkin.urgentAlertedAt) {
    await alertFamilyNow(senior, text);
    await store.update('checkins', checkinId, { urgentAlertedAt: new Date().toISOString() });
  }
  transcript.push({ who: 'porchlight', text: answer, at: new Date().toISOString() });
  await store.update('checkins', checkinId, { transcript });
  return { reply: answer, ended: false, streamed };
}

// "Help with my phone": one step at a time. A fake warning on the screen is saved as a scam check
// (so it shows in the app) and the family hears about it, once per call. When it's solved, ask before hanging up.
async function techTurn(senior, checkin, transcript) {
  const result = await techTalk(senior, transcript);
  const patch = {};
  if (result.scam && !checkin.scamCheckId) {
    const said = transcript.filter((t) => t.who === 'senior').map((t) => t.text).join(' ').slice(0, 2000);
    const saved = await store.insert('scamChecks', {
      seniorId: senior._id, description: said, channel: 'call', checkinId: checkin._id, verdict: 'likely scam',
      redFlags: ['A warning on the screen asking to call, pay or let someone in'], advice: 'Don’t call the number or pay anything. Close it, and call family if it comes back.',
    });
    patch.scamCheckId = saved._id;
    const family = senior.circleId ? (await store.list('members', { circleId: senior.circleId })).filter((m) => m.role === 'family') : [];
    for (const m of family) await sms(m, `${senior.preferredName} asked Porchlight for help with a screen that sounds like a scam: "${said.slice(0, 140)}". Porchlight told them not to call or pay anyone. Worth a call today.`);
  }
  let say = result.say;
  if (result.done) {
    say = `${say} Is there anything else on your screen I can help with, or shall we say goodbye?`;
    patch.askedToEnd = true;
  }
  transcript.push({ who: 'porchlight', text: say, at: new Date().toISOString() });
  await store.update('checkins', checkin._id, { transcript, ...patch });
  return { reply: say, ended: false };
}

// Promises Porchlight just made out loud are kept: a check-back call when she's unwell, and a
// pill-box reminder on tomorrow's call when she wasn't sure about a pill.
async function followUps(senior, checkin, said, answer) {
  const fresh = await store.get('seniors', senior._id);
  if (/quick call in a couple of hours/.test(answer) && checkin.channel === 'phone' && !fresh.callbackAt) {
    await store.update('seniors', senior._id, { callbackAt: new Date(Date.now() + 2 * 3600000).toISOString(), callbackReason: 'check-back' });
  }
  if (/remind you to look at your pill box/.test(answer)) {
    const tz = senior.timezone || 'America/New_York';
    const due = localDate(tz, 1);
    const reminders = fresh.reminders || [];
    if (!reminders.some((r) => r.what === 'look at your pill box' && r.due === due && !r.saidAt)) {
      await store.update('seniors', senior._id, { reminders: [...reminders, { what: 'look at your pill box', when: 'tomorrow', due, createdOn: localDate(tz), createdAt: new Date().toISOString(), checkinId: checkin._id }] });
    }
  }
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
  // One card per story: a memory she tells again (same title, or mostly the same words) isn't saved twice.
  const key = (x) => String(x || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter((w) => w.length > 3);
  const told = (await store.list('checkins', { seniorId: senior._id })).filter((c) => c._id !== checkinId).flatMap((c) => c.stories || []);
  const same = (a, b) => {
    if (key(a.title).join(' ') === key(b.title).join(' ')) return true;
    const wa = new Set(key(a.text)); const wb = key(b.text);
    return wb.length > 0 && wb.filter((w) => wa.has(w)).length / wb.length >= 0.6;
  };
  analysis.stories = (analysis.stories || []).filter((st) => !told.some((old) => same(old, st)));
  const updated = await store.update('checkins', checkinId, {
    ...analysis, status: 'completed', endedAt: new Date().toISOString(),
  });
  await handleCheckinOutcome(senior, updated, analysis);
  return updated;
}
