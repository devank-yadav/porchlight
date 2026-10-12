// The escalation ladder: when a check-in is missed or help is requested,
// widen the circle step by step until someone confirms the senior is okay.
import * as store from '../store.js';
import { sms, sayOnCall, twilioEnabled } from '../voice/notify.js';
import { helpText, helpSpoken } from './help.js';

// Real numbers only; fictional +1555 test numbers are never dialed.
const dialable = (phone) => (phone && !phone.startsWith('+1555') ? phone : null);

const STEP_MS = Number(process.env.ESCALATION_STEP_MS || 10 * 60000); // 10 minutes between steps (set lower for a demo)
// A help press moves faster: if no one has said "I'm on it" after 3 minutes, the family is called again.
const HELP_STEP_MS = Math.min(STEP_MS, 3 * 60000);
const timers = new Map();

// Quiet hours (B7): no texts 9 PM–8 AM in the member's own time zone for an unresolved
// check-in. A help press ignores quiet hours. QUIET_HOURS_DEMO=1 forces quiet hours on (to show it).
function inQuietHours(member) {
  if (process.env.QUIET_HOURS_DEMO === '1') return true;
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: member.timezone || 'America/New_York' }).format(new Date()));
  return hour >= 21 || hour < 8;
}

// Only steps for people this circle actually has (no neighbor, no neighbor step).
function ladder(reason, members) {
  const has = (role) => members.some((m) => m.role === role);
  const steps = reason === 'help'
    ? [
      { target: 'family', label: 'Call and alert the whole family' },
      { target: 'family', label: 'Call the family again if no one is on it yet', again: true },
      has('neighbor') && { target: 'neighbor', label: 'Ask the neighbor to knock on the door' },
      has('volunteer') && { target: 'volunteer', label: 'Alert the program volunteer to call 911 if no one reaches them' },
    ]
    : [
      { target: 'primary', label: 'Alert the primary family contact' },
      { target: 'family', label: 'Alert the rest of the family' },
      has('neighbor') && { target: 'neighbor', label: 'Ask the neighbor to knock on the door' },
      has('volunteer') && { target: 'volunteer', label: 'Hand off to the program volunteer' },
    ];
  return steps.filter(Boolean);
}

// context (help only): where they are and what Porchlight knows (help.js), shown in the family app.
export async function start(senior, reason, context = null) {
  const existing = (await store.list('escalations', { seniorId: senior._id, status: 'active' }))[0];
  if (existing && (existing.reason === reason || reason === 'missed')) {
    // Pressed help again: keep one alert, with the newest location.
    if (context && reason === 'help') return store.update('escalations', existing._id, { context });
    return existing;
  }
  if (existing) { // help while a missed-call alert runs: help wins
    clearTimeout(timers.get(existing._id));
    await store.update('escalations', existing._id, { status: 'resolved', resolvedBy: 'their help alert', resolvedAt: new Date().toISOString() });
  }
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const esc = await store.insert('escalations', {
    seniorId: senior._id,
    reason, // 'missed' | 'help'
    context,
    status: 'active',
    stepMs: reason === 'help' ? HELP_STEP_MS : STEP_MS,
    steps: ladder(reason, members).map((s) => ({ ...s, status: 'pending', at: null })),
  });
  await store.update('seniors', senior._id, { status: reason === 'help' ? 'help' : 'missed' });
  runStep(esc._id, 0);
  return esc;
}

async function runStep(escId, i) {
  const esc = await store.get('escalations', escId);
  if (!esc || esc.status !== 'active') return;
  if (i >= esc.steps.length) {
    await store.update('escalations', escId, { status: 'exhausted' });
    return;
  }
  const senior = await store.get('seniors', esc.seniorId);
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const volunteers = members.filter((m) => m.role === 'volunteer');
  const step = esc.steps[i];
  const who = senior.preferredName;

  const help = esc.reason === 'help';
  const msg = (m) => (help
    ? helpText(senior, esc.context, m, senior.phone)
    : `${who} hasn't answered today's Porchlight call. It may be nothing. Can you reach them? Open Porchlight to say you're on it.`);

  const sent = [];
  const held = [];
  const send = async (m, text) => {
    if (!help && inQuietHours(m)) { held.push(m.name); return; }
    await sms(m, text, help ? { title: `${who} needs help`, urgent: true } : {});
    sent.push(m.name);
    // A help alert also rings each person's phone and reads it out (no texting number needed).
    if (help && dialable(m.phone)) {
      if (!twilioEnabled) console.warn(`[escalation] no Twilio: the help call to ${m.name} was not placed`);
      else await sayOnCall(m.phone, helpSpoken(senior, esc.context)).catch((e) => console.warn('[escalation] alert call failed:', e.message));
    }
  };
  if (step.target === 'family') for (const m of members.filter((m) => m.role === 'family' && (help || !m.primary))) await send(m, step.again ? `Still no one has said they're on it.\n${msg(m)}` : msg(m));
  if (step.target === 'primary') for (const m of members.filter((m) => m.primary)) await send(m, msg(m));
  if (step.target === 'neighbor') for (const m of members.filter((m) => m.role === 'neighbor')) await send(m, help ? `${msg(m)}\nCould you knock on ${who}'s door?` : `Could you knock on ${who}'s door? They haven't answered today's call.`);
  if (step.target === 'volunteer') for (const m of volunteers) await send(m, help ? msg(m) : `${who} needs a human. Today's call is unanswered and the family hasn't been reached yet.`);

  // A step whose texts were all held shows "held for quiet hours" in the app.
  const status = held.length && !sent.length ? 'held' : 'done';
  const steps = esc.steps.map((s, j) => (j === i ? { ...s, status, at: new Date().toISOString(), sent, held } : s));
  await store.update('escalations', escId, { steps, current: i });
  timers.set(escId, setTimeout(() => runStep(escId, i + 1), esc.stepMs || STEP_MS));
}

// "I'm on it": one person takes it. The ladder stops widening, the rest of the circle is told,
// and the older adult sees who is coming. The alert stays until someone confirms they're okay.
export async function acknowledge(seniorId, member) {
  const [esc] = await store.list('escalations', { seniorId, status: 'active' });
  if (!esc || esc.ack) return esc || null;
  clearTimeout(timers.get(esc._id));
  timers.delete(esc._id);
  const steps = esc.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s));
  const updated = await store.update('escalations', esc._id, { ack: { memberId: member._id, name: member.name, at: new Date().toISOString() }, steps });
  const senior = await store.get('seniors', seniorId);
  const first = member.name.split(' ')[0];
  await store.insert('notices', { seniorId, kind: 'help', text: `${first} saw your alert and is on it.`, at: new Date().toISOString() });
  const others = (await store.list('members', { circleId: senior.circleId })).filter((m) => m._id !== member._id && m.role === 'family');
  for (const m of others) await sms(m, `${first} is on it: they're reaching ${senior.preferredName} now.`);
  return updated;
}

export async function resolve(seniorId, byName) {
  const active = [
    ...(await store.list('escalations', { seniorId, status: 'active' })),
    ...(await store.list('escalations', { seniorId, status: 'exhausted' })),
  ];
  for (const esc of active) {
    clearTimeout(timers.get(esc._id));
    timers.delete(esc._id);
    const steps = esc.steps.map((s) => (['pending', 'held'].includes(s.status) ? { ...s, status: 'skipped' } : s));
    await store.update('escalations', esc._id, { status: 'resolved', resolvedBy: byName, resolvedAt: new Date().toISOString(), steps });
  }
  return active.length;
}
