// The escalation ladder: when a check-in is missed or help is requested,
// widen the circle step by step until someone confirms the senior is okay.
import * as store from '../store.js';
import { sms } from '../voice/notify.js';

const STEP_MS = Number(process.env.ESCALATION_STEP_MS || 5000); // demo speed; real life ~15 min
const timers = new Map();

// Quiet hours (B7): no texts 9 PM–8 AM in the member's own time zone for an unresolved
// check-in. A help press ignores quiet hours. QUIET_HOURS_DEMO=1 forces quiet hours on (to show it).
function inQuietHours(member) {
  if (process.env.QUIET_HOURS_DEMO === '1') return true;
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: member.timezone || 'America/New_York' }).format(new Date()));
  return hour >= 21 || hour < 8;
}

function ladder(reason) {
  if (reason === 'help') {
    return [
      { target: 'family', label: 'Text the whole family circle' },
      { target: 'neighbor', label: 'Ask the neighbor to knock on the door' },
      { target: 'volunteer', label: 'Alert the program volunteer to call 911 if no one reaches her' },
    ];
  }
  return [
    { target: 'retry', label: 'Call again' },
    { target: 'primary', label: 'Text the primary family contact' },
    { target: 'neighbor', label: 'Ask the neighbor to knock on the door' },
    { target: 'volunteer', label: 'Hand off to the program volunteer' },
  ];
}

export async function start(senior, reason) {
  const existing = (await store.list('escalations', { seniorId: senior._id, status: 'active' }))[0];
  if (existing) return existing;
  const esc = await store.insert('escalations', {
    seniorId: senior._id,
    reason, // 'missed' | 'help'
    status: 'active',
    stepMs: STEP_MS,
    steps: ladder(reason).map((s) => ({ ...s, status: 'pending', at: null })),
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
  const volunteers = await store.list('members', { role: 'volunteer' });
  const step = esc.steps[i];
  const who = senior.preferredName;

  const msg = esc.reason === 'help'
    ? `${who} pressed her help button. Please call her now. Reply OK when someone has reached her.`
    : `${who}'s check-in is unresolved: she hasn't answered yet. It may be nothing. Can you reach her? Reply OK once you have.`;

  const sent = [];
  const held = [];
  const send = async (m, text) => {
    if (esc.reason !== 'help' && inQuietHours(m)) held.push(m.name);
    else { await sms(m, text); sent.push(m.name); }
  };
  if (step.target === 'family') for (const m of members.filter((m) => m.role === 'family')) await send(m, msg);
  if (step.target === 'primary') for (const m of members.filter((m) => m.primary)) await send(m, msg);
  if (step.target === 'neighbor') for (const m of members.filter((m) => m.role === 'neighbor')) await send(m, `Could you knock on ${who}'s door? She hasn't answered her check-in. Reply OK when you've seen her.`);
  if (step.target === 'volunteer') for (const m of volunteers) await send(m, `${who} (${senior.city}) needs a human. ${esc.reason === 'help' ? 'She pressed help.' : 'Check-in unresolved, family not reached yet.'}`);

  // A step whose texts were all held shows "held for quiet hours" in the app.
  const status = held.length && !sent.length ? 'held' : 'done';
  const steps = esc.steps.map((s, j) => (j === i ? { ...s, status, at: new Date().toISOString(), sent, held } : s));
  await store.update('escalations', escId, { steps, current: i });
  timers.set(escId, setTimeout(() => runStep(escId, i + 1), STEP_MS));
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
