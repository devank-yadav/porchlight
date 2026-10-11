// OWNER: Person B (backend & workflows).
// Actions: anything the AI wants to DO that needs a human OK (Phase 1: rides).
// PENDING_APPROVAL → APPROVED → REQUESTED → CONFIRMED → COMPLETED, or REJECTED / FAILED / CANCELLED.
// The ride provider is a sandbox: every booking is simulated and labelled that way.
// Rides no longer wait for the family (Devank, 2026-10-11): Porchlight books right away and the
// family gets a heads-up text with an Uber link. A family can turn "Ask me before booking rides" back on (senior.askBeforeRides).
import * as store from '../store.js';
import * as audit from './audit.js';
import { sms, tellSenior } from '../voice/notify.js';
import { uberLink } from './uber.js';

const SANDBOX_STEP_MS = Number(process.env.SANDBOX_STEP_MS || 2000);
const OPEN = ['PENDING_APPROVAL', 'APPROVED', 'REQUESTED', 'CONFIRMED'];
const NEXT = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['REQUESTED', 'FAILED', 'CANCELLED'],
  REQUESTED: ['CONFIRMED', 'FAILED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
};
const TRANSPORT = { PENDING_APPROVAL: 'at_risk', APPROVED: 'requested', REQUESTED: 'requested', CONFIRMED: 'confirmed', COMPLETED: 'confirmed', REJECTED: 'at_risk', FAILED: 'at_risk' };

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Her local time (Peggy is in New York), even when the server runs in UTC.
const TZ = 'America/New_York';
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtDay = (iso) => {
  const day = (x) => x.toLocaleDateString('en-US', { timeZone: TZ });
  const tomorrow = new Date(Date.now() + 86400000);
  return day(new Date(iso)) === day(tomorrow) ? 'tomorrow' : new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
};

async function move(action, status, actor, evidence) {
  if (!NEXT[action.status]?.includes(status)) throw new HttpError(409, `Can't go from ${action.status} to ${status}.`);
  const history = [...(action.history || []), { status, at: new Date().toISOString(), actor, evidence }];
  const updated = await store.update('actions', action._id, { status, history });
  if (action.appointmentId && TRANSPORT[status]) await store.update('appointments', action.appointmentId, { transport: TRANSPORT[status] });
  await audit.log(actor, `action.${status.toLowerCase()}`, { seniorId: action.seniorId, targetId: action._id, detail: evidence?.note || '' });
  return updated;
}

// One open ride per appointment: proposing again returns the existing one.
export async function proposeRide(senior, appointment, quote) {
  const open = (await store.list('actions', { seniorId: senior._id, kind: 'ride' }))
    .find((a) => a.appointmentId === appointment._id && OPEN.includes(a.status));
  if (open) return open;
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const approver = members.find((m) => m.canApprove) || members.find((m) => m.primary);
  const pickupAt = new Date(new Date(appointment.startsAt).getTime() - 45 * 60000).toISOString();
  const action = await store.insert('actions', {
    seniorId: senior._id, kind: 'ride', title: `Ride to ${appointment.title.toLowerCase()} ${fmtDay(appointment.startsAt)}`,
    reason: `${senior.preferredName} said: "${quote}"`,
    details: { pickupAt, from: '12 Maple Ln (sample)', to: appointment.where, needs: 'Uses a cane', uberLink: uberLink({ from: '12 Maple Ln (sample)', to: appointment.where }) },
    appointmentId: appointment._id, approverId: approver?._id ?? null, simulated: true, status: 'PENDING_APPROVAL',
    history: [{ status: 'PENDING_APPROVAL', at: new Date().toISOString(), actor: 'porchlight', evidence: { source: 'system', note: `From today's check-in call: "${quote}"` } }],
  });
  await store.update('appointments', appointment._id, { transport: 'at_risk', actionId: action._id });
  await audit.log('porchlight', 'action.proposed', { seniorId: senior._id, targetId: action._id, detail: action.title });
  if (senior.askBeforeRides === true) {
    if (approver) await sms(approver, `${senior.preferredName} doesn't have a ride to her ${appointment.title.toLowerCase()} ${fmtDay(appointment.startsAt)}. Open Porchlight to approve a ride (simulated booking).`);
    return action;
  }
  // No approval step: book now, and let the whole family know she's going.
  const booked = await move(action, 'APPROVED', 'porchlight', { source: 'system', note: 'Booked automatically; family notified' });
  const fam = members.filter((m) => m.role === 'family');
  const where = appointment.where ? ` at ${appointment.where.replace(/\s*\(sample\)/i, '')}` : '';
  for (const m of fam) {
    await sms(m, `Heads-up: ${senior.preferredName} is going to her ${appointment.title.toLowerCase()}${where} ${fmtDay(appointment.startsAt)} at ${fmtTime(appointment.startsAt)}. Porchlight is booking her ride (simulated), pickup ${fmtTime(pickupAt)}.${m.primary || m.canApprove ? ` Book a real Uber instead: ${booked.details.uberLink}` : ''}`);
  }
  runSandbox(booked._id).catch((e) => console.error('[actions] sandbox failed:', e));
  return booked;
}

async function load(id, memberId, { mustApprove = false } = {}) {
  const action = await store.get('actions', id);
  if (!action) throw new HttpError(404, 'Action not found.');
  const member = memberId ? await store.get('members', memberId) : null;
  if (!member) throw new HttpError(400, 'memberId is required.');
  if (mustApprove && !member.canApprove) throw new HttpError(403, `${member.name.split(' ')[0]} can't approve this. Waiting for the primary caregiver.`);
  return { action, member };
}

export async function approve(id, memberId) {
  const { action, member } = await load(id, memberId, { mustApprove: true });
  if (action.status !== 'PENDING_APPROVAL') return action; // idempotent: approving twice never double-books
  const approved = await move(action, 'APPROVED', member._id, { source: 'caregiver', note: `Approved by ${member.name}` });
  runSandbox(approved._id).catch((e) => console.error('[actions] sandbox failed:', e));
  return approved;
}

export async function reject(id, memberId) {
  const { action, member } = await load(id, memberId, { mustApprove: true });
  if (action.status === 'REJECTED') return action;
  return move(action, 'REJECTED', member._id, { source: 'caregiver', note: `${member.name} said no; the family will sort the ride out themselves` });
}

export async function complete(id, memberId) {
  const { action, member } = await load(id, memberId);
  if (action.status === 'COMPLETED') return action;
  return move(action, 'COMPLETED', member._id, { source: 'caregiver', note: `${member.name} marked the ride done` });
}

// Sample ride service: request after a moment, confirm a moment later. Never a real ride.
async function runSandbox(id) {
  await new Promise((r) => setTimeout(r, SANDBOX_STEP_MS));
  let action = await store.get('actions', id);
  if (action?.status !== 'APPROVED') return;
  action = await move(action, 'REQUESTED', 'sandbox', { source: 'sandbox', note: 'Request sent to sample ride service (simulated)' });
  await new Promise((r) => setTimeout(r, SANDBOX_STEP_MS * 2));
  action = await store.get('actions', id);
  if (action?.status !== 'REQUESTED') return;
  const ref = `SBX-${Math.floor(1000 + Math.random() * 9000)}`;
  action = await move(action, 'CONFIRMED', 'sandbox', { source: 'sandbox', note: 'Simulated booking, not a real ride', ref });

  const senior = await store.get('seniors', action.seniorId);
  const text = `Your ride is confirmed: pickup ${fmtDay(action.details.pickupAt)} at ${fmtTime(action.details.pickupAt)}.`;
  await store.insert('notices', { seniorId: senior._id, kind: 'ride', text, at: new Date().toISOString(), simulated: true, actionId: id });
  await tellSenior(senior, text);
  const approver = action.approverId ? await store.get('members', action.approverId) : null;
  if (approver) await sms(approver, `Ride confirmed for ${senior.preferredName}: pickup ${fmtDay(action.details.pickupAt)} ${fmtTime(action.details.pickupAt)} (simulated booking ${ref}). We told her.`);
}
