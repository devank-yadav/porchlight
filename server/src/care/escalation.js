// The escalation ladder: when a check-in is missed or help is requested,
// widen the circle step by step until someone confirms the senior is okay.
import * as store from '../store.js';
import { sms } from '../voice/notify.js';

const STEP_MS = Number(process.env.ESCALATION_STEP_MS || 5000); // demo speed; real life ~15 min
const timers = new Map();

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
    : `${who} hasn't answered her check-in. Can you reach her? Reply OK once you have.`;

  if (step.target === 'family') for (const m of members.filter((m) => m.role === 'family')) await sms(m, msg);
  if (step.target === 'primary') for (const m of members.filter((m) => m.primary)) await sms(m, msg);
  if (step.target === 'neighbor') for (const m of members.filter((m) => m.role === 'neighbor')) await sms(m, `Could you knock on ${who}'s door? She hasn't answered. Reply OK when you've seen her.`);
  if (step.target === 'volunteer') for (const m of volunteers) await sms(m, `${who} (${senior.city}) needs a human. ${esc.reason === 'help' ? 'She pressed help.' : 'Missed check-in, family not reached yet.'}`);

  const steps = esc.steps.map((s, j) => (j === i ? { ...s, status: 'done', at: new Date().toISOString() } : s));
  await store.update('escalations', escId, { steps, current: i });
  timers.set(escId, setTimeout(() => runStep(escId, i + 1), STEP_MS));
}

export async function resolve(seniorId, byName) {
  const active = await store.list('escalations', { seniorId, status: 'active' });
  for (const esc of active) {
    clearTimeout(timers.get(esc._id));
    timers.delete(esc._id);
    const steps = esc.steps.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s));
    await store.update('escalations', esc._id, { status: 'resolved', resolvedBy: byName, resolvedAt: new Date().toISOString(), steps });
  }
  return active.length;
}
