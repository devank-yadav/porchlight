// The escalation ladder: when a check-in is missed or help is requested,
// widen the circle step by step until someone confirms the senior is okay.
import * as store from '../store.js';
import { sms } from '../voice/notify.js';

const STEP_MS = Number(process.env.ESCALATION_STEP_MS || 5000); // demo speed; real life ~15 min
const timers = new Map();

// Quiet hours: no texts 9 PM–8 AM in the recipient's own time zone for a missed
// check-in (she may just be asleep). Help ignores quiet hours.
const QUIET_START = 21;
const QUIET_END = 8;
export function isQuietHours(timezone, now = new Date()) {
  const h = Number(now.toLocaleString('en-US', { timeZone: timezone || 'America/New_York', hour: 'numeric', hour12: false })) % 24;
  return h >= QUIET_START || h < QUIET_END;
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

// opts.night: demo control, treat everyone as inside quiet hours (shows held steps by day).
export async function start(senior, reason, opts = {}) {
  const existing = (await store.list('escalations', { seniorId: senior._id, status: 'active' }))[0];
  if (existing) return existing;
  const esc = await store.insert('escalations', {
    seniorId: senior._id,
    reason, // 'missed' | 'help'
    status: 'active',
    stepMs: STEP_MS,
    night: !!opts.night,
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

  const recipients =
    step.target === 'family' ? members.filter((m) => m.role === 'family')
    : step.target === 'primary' ? members.filter((m) => m.primary)
    : step.target === 'neighbor' ? members.filter((m) => m.role === 'neighbor')
    : step.target === 'volunteer' ? volunteers
    : [];
  const text = step.target === 'neighbor'
    ? `Could you knock on ${who}'s door? She hasn't answered. Reply OK when you've seen her.`
    : step.target === 'volunteer'
      ? `${who} (${senior.city}) needs a human. ${esc.reason === 'help' ? 'She pressed help.' : 'Missed check-in, family not reached yet.'}`
      : msg;

  const sent = [];
  const held = [];
  for (const m of recipients) {
    if (esc.reason !== 'help' && (esc.night || isQuietHours(m.timezone))) held.push(m.name);
    else { await sms(m, text); sent.push(m.name); }
  }
  // A step is "held" only when it had people to text and every one of them is in quiet hours.
  const status = recipients.length && !sent.length ? 'held' : 'done';

  const steps = esc.steps.map((s, j) => (j === i ? { ...s, status, at: new Date().toISOString(), sent, held } : s));
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
