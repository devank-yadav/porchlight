// OWNER: Person B (backend & workflows).
// The family digest: one line plus a few items, urgent first, then attention, then ok.
const fmt = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function buildDigest({ senior, checkins, tasks, actions, escalations, viewer }) {
  if (!senior) return { line: '', items: [] };
  const items = [];
  const name = senior.preferredName;
  const today = new Date().toDateString();
  const latest = checkins.find((c) => c.seniorId === senior._id && c.status === 'completed' && c.endedAt);
  const activeEsc = escalations.find((e) => e.seniorId === senior._id && e.status === 'active');

  if (activeEsc?.reason === 'help' || senior.status === 'help') items.push({ tone: 'urgent', text: `${name} needs help now`, target: { type: 'escalation', id: activeEsc?._id ?? null } });
  for (const f of latest?.flags || []) {
    if (f.type === 'scam') items.push({ tone: 'urgent', text: `Possible scam call: "${f.text}"`, target: { type: 'checkin', id: latest._id } });
  }
  for (const a of actions.filter((x) => x.seniorId === senior._id && x.status === 'PENDING_APPROVAL')) {
    items.push({ tone: 'attention', text: viewer?.canApprove === false ? `${a.title}: waiting for approval` : `${a.title} needs your OK`, target: { type: 'action', id: a._id } });
  }
  if (activeEsc?.reason === 'missed') items.push({ tone: 'attention', text: `Today's check-in is unresolved`, target: { type: 'escalation', id: activeEsc._id } });
  if (latest?.medStatus === 'unsure' && viewer?.seesMeds !== false) items.push({ tone: 'attention', text: `${name} wasn't sure about her pills`, target: { type: 'checkin', id: latest._id } });
  const open = tasks.filter((t) => t.seniorId === senior._id && t.status === 'open' && !t.hidden);
  const unowned = open.filter((t) => !t.assignee);
  if (unowned.length) items.push({ tone: 'attention', text: `${unowned.length} task${unowned.length > 1 ? 's' : ''} need${unowned.length > 1 ? '' : 's'} someone`, target: { type: 'task', id: unowned[0]._id } });
  for (const a of actions.filter((x) => x.seniorId === senior._id && x.status === 'CONFIRMED')) {
    items.push({ tone: 'ok', text: `${a.title}: confirmed (simulated booking)`, target: { type: 'action', id: a._id } });
  }
  if (latest && new Date(latest.endedAt).toDateString() === today) items.push({ tone: 'ok', text: latest.summary, target: { type: 'checkin', id: latest._id } });

  const parts = [];
  parts.push(latest && new Date(latest.endedAt).toDateString() === today ? `Checked in ${fmt(latest.endedAt)}` : 'No check-in yet today');
  const pending = actions.filter((x) => x.seniorId === senior._id && x.status === 'PENDING_APPROVAL').length;
  if (pending) parts.push(viewer?.canApprove === false ? 'Ride waiting for approval' : 'Ride needs your OK');
  if (open.length) parts.push(`${open.length} task${open.length > 1 ? 's' : ''} open`);
  const order = { urgent: 0, attention: 1, ok: 2 };
  return { line: parts.join(' · '), items: items.sort((a, b) => order[a.tone] - order[b.tone]) };
}
