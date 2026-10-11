// OWNER: Person B (backend & workflows).
// What happens after a check-in: turn the AI's structured analysis into tasks, actions,
// statuses and alerts. Voice (Person A) calls handleCheckinOutcome(); everything after is here.
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { sms } from '../voice/notify.js';

export async function handleCheckinOutcome(senior, checkin, a) {
  const urgent = a.flags.some((f) => f.type === 'urgent');
  const scam = a.flags.some((f) => f.type === 'scam');

  for (const r of a.requests) {
    await store.insert('tasks', {
      seniorId: senior._id, title: r.title, type: r.type, due: r.when || 'This week',
      assignee: null, status: 'open', source: 'checkin', checkinId: checkin._id,
    });
  }

  const status = urgent ? 'help' : scam ? 'scam' : a.flags.length ? 'needs-human' : 'ok';
  await store.update('seniors', senior._id, { status, lastNote: a.summary, lastCheckinAt: checkin.endedAt });
  await escalation.resolve(senior._id, 'Check-in completed');

  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const family = members.filter((m) => m.role === 'family');
  if (urgent) await escalation.start(senior, 'help');
  else if (scam) {
    const quote = a.flags.find((f) => f.type === 'scam').text;
    for (const m of family) await sms(m, `${senior.preferredName} mentioned a call that sounds like a scam: "${quote}". Worth a call today.`);
  }
}
