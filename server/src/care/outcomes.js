// OWNER: Person B (backend & workflows).
// What happens after a check-in: turn the AI's structured analysis into tasks, actions,
// statuses and alerts. Voice (Person A) calls handleCheckinOutcome(); everything after is here.
import * as store from '../store.js';
import * as escalation from './escalation.js';
import { sms } from '../voice/notify.js';
import { proposeRide } from './actions.js';

// Who should do it: errands/repairs → neighbor or the sibling with the fewest done tasks; refills/meds → primary.
async function suggestOwner(senior, type, members) {
  const primary = members.find((m) => m.primary) || members[0];
  if (['refill', 'meds'].includes(type)) return primary?._id ?? null;
  const helpers = members.filter((m) => !m.primary && ['family', 'neighbor'].includes(m.role));
  if (!helpers.length) return primary?._id ?? null;
  const done = await store.list('tasks', { seniorId: senior._id, status: 'done' });
  const count = (id) => done.filter((t) => t.assignee === id).length;
  return helpers.sort((a, b) => count(a._id) - count(b._id))[0]._id;
}

export async function handleCheckinOutcome(senior, checkin, a) {
  const urgent = a.flags.some((f) => f.type === 'urgent');
  const scam = a.flags.some((f) => f.type === 'scam');

  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const upcoming = (await store.list('appointments', { seniorId: senior._id }))
    .filter((ap) => new Date(ap.startsAt) > new Date() && ap.transport !== 'confirmed')
    .sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt));

  for (const r of a.requests) {
    // A ride she can't get herself, with an appointment coming up → an action that needs Anne's OK.
    if (r.type === 'ride' && (r.blocker || upcoming.length) && upcoming[0]) {
      await proposeRide(senior, upcoming[0], r.quote || r.title);
      continue;
    }
    await store.insert('tasks', {
      seniorId: senior._id, title: r.title, type: r.type, due: r.when || 'This week',
      assignee: null, status: 'open', source: 'checkin', checkinId: checkin._id,
      quote: r.quote || null, requestedBy: 'peggy', suggestedOwner: await suggestOwner(senior, r.type, members),
      handoff: null, sensitive: false,
    });
  }

  if (a.medStatus === 'unsure') {
    const primary = members.find((m) => m.primary);
    const pill = senior.meds?.[0]?.name || 'morning pills';
    await store.insert('tasks', {
      seniorId: senior._id, title: `Check with ${senior.preferredName} about her ${pill}`, type: 'meds', due: 'Today',
      assignee: null, status: 'open', source: 'checkin', checkinId: checkin._id,
      quote: a.flags.find((f) => f.type === 'meds_unsure')?.text || null, requestedBy: 'peggy',
      suggestedOwner: primary?._id ?? null, handoff: null, sensitive: true,
    });
  }

  const status = urgent ? 'help' : scam ? 'scam' : a.flags.some((f) => f.type !== 'meds_unsure') ? 'needs-human' : 'ok';
  await store.update('seniors', senior._id, { status, lastNote: a.summary, lastCheckinAt: checkin.endedAt });
  await escalation.resolve(senior._id, 'Check-in completed');

  const family = members.filter((m) => m.role === 'family');
  if (urgent) await escalation.start(senior, 'help');
  else if (scam) {
    const quote = a.flags.find((f) => f.type === 'scam').text;
    for (const m of family) await sms(m, `${senior.preferredName} mentioned a call that sounds like a scam: "${quote}". Worth a call today.`);
  }
}
