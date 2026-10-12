// OWNER: Person B (backend & workflows).
// Actions: anything the AI wants to DO that needs a human OK (Phase 1: rides).
// PENDING_APPROVAL → APPROVED → REQUESTED → CONFIRMED → COMPLETED, or REJECTED / FAILED / CANCELLED.
// Porchlight never books or pays for a ride: it opens Uber with the trip filled in, and the older adult confirms it there.
// Rides no longer wait for the family (Devank, 2026-10-11): Porchlight books right away and the
// family gets a heads-up text with an Uber link. A family can turn "Ask me before booking rides" back on (senior.askBeforeRides).
import * as store from '../store.js';
import * as audit from './audit.js';
import { sms, push } from '../voice/notify.js';
import { uberLink, geocode } from './uber.js';

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

// Her local time, even when the server runs in UTC.
const fmtTime = (iso, tz = 'America/New_York') => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
const fmtDay = (iso, tz = 'America/New_York') => {
  const day = (x) => x.toLocaleDateString('en-US', { timeZone: tz });
  const tomorrow = new Date(Date.now() + 86400000);
  return day(new Date(iso)) === day(tomorrow) ? 'tomorrow' : new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
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
  const ask = senior.askBeforeRides === true;
  const first = ask ? 'PENDING_APPROVAL' : 'APPROVED'; // the app shows "booked" when history has no PENDING_APPROVAL
  const tz = senior.timezone;
  const pickupAt = new Date(new Date(appointment.startsAt).getTime() - 45 * 60000).toISOString();
  const destination = appointment.where?.trim();
  const spot = destination ? await geocode(destination, senior.homeLatLng) : null;
  const rideLink = await rideHandoff(senior, { to: destination || appointment.title, place: destination ? spot?.address || destination : undefined, placeLatLng: spot?.latlng });
  const action = await store.insert('actions', {
    seniorId: senior._id, kind: 'ride', title: `Ride to ${appointment.title.toLowerCase()} ${fmtDay(appointment.startsAt)}`,
    reason: `${senior.preferredName} said: "${quote}"`,
    details: { pickupAt, from: senior.home ? 'Home' : 'Her location', to: destination || appointment.title, uberLink: rideLink },
    appointmentId: appointment._id, approverId: approver?._id ?? null, status: first,
    history: [{ status: first, at: new Date().toISOString(), actor: 'porchlight', evidence: { source: 'system', note: ask ? `From today's check-in call: "${quote}"` : `Booked from today's check-in call: "${quote}"; family notified` } }],
  });
  await store.update('appointments', appointment._id, { transport: ask ? 'at_risk' : 'requested', actionId: action._id });
  await audit.log('porchlight', 'action.proposed', { seniorId: senior._id, targetId: action._id, detail: action.title });
  if (ask) {
    if (approver) await sms(approver, `${senior.preferredName} doesn't have a ride to her ${appointment.title.toLowerCase()} ${fmtDay(appointment.startsAt, tz)}. Open Porchlight to OK an Uber for her.`);
    return action;
  }
  await handOver(senior, action, appointment, members);
  return action;
}

// The ride is hers to book: a "Book my Uber" button and a phone notification for her, and a heads-up for the family.
async function handOver(senior, action, appointment, members) {
  const tz = senior.timezone;
  const pickupAt = action.details.pickupAt;
  const where = appointment?.where ? ` at ${appointment.where}` : '';
  const what = appointment ? `the ${appointment.title.toLowerCase()}` : action.details.to;
  await store.insert('notices', {
    seniorId: senior._id, kind: 'uber', actionId: action._id, uberLink: action.details.uberLink, at: new Date().toISOString(),
    text: `Your ride to ${what} ${appointment ? fmtDay(appointment.startsAt, tz) : ''}: tap "Book my Uber" and Uber opens with your trip filled in. Leave by ${fmtTime(pickupAt, tz)}.`.replace(/\s+:/, ':'),
  });
  await push(senior, { title: `Your Uber to ${what} is ready`, body: 'Tap to open Uber with your trip filled in, then press Request.', url: action.details.uberLink });
  for (const m of members.filter((x) => x.role === 'family')) {
    await sms(m, `Heads-up: ${senior.preferredName} is going to ${what.replace(/^the /, 'her ')}${where}${appointment ? ` ${fmtDay(appointment.startsAt, tz)} at ${fmtTime(appointment.startsAt, tz)}` : ''}, pickup ${fmtTime(pickupAt, tz)}. Porchlight set up her Uber ride; she books and pays for it in Uber.`);
  }
}

// Pickup at her home address when the family added one, else wherever her phone is.
export async function rideHandoff(senior, { to, place, placeLatLng, pickupPlace, pickupLatLng } = {}) {
  const latlng = senior.homeLatLng || (senior.home ? (await geocode(senior.home))?.latlng : null);
  return uberLink({ from: senior.home || '', fromLatLng: latlng, to, place, placeLatLng, pickupPlace, pickupLatLng });
}

async function load(id, memberId, { mustApprove = false } = {}) {
  const action = await store.get('actions', id);
  if (!action) throw new HttpError(404, 'Action not found.');
  const member = memberId ? await store.get('members', memberId) : null;
  if (!member) throw new HttpError(403, 'Only family members can do this.');
  if (mustApprove && !member.canApprove) throw new HttpError(403, `${member.name.split(' ')[0]} can't approve this. Waiting for the primary caregiver.`);
  return { action, member };
}

export async function approve(id, memberId) {
  const { action, member } = await load(id, memberId, { mustApprove: true });
  if (action.status !== 'PENDING_APPROVAL') return action; // idempotent: approving twice never double-books
  const approved = await move(action, 'APPROVED', member._id, { source: 'caregiver', note: `OK'd by ${member.name}` });
  const senior = await store.get('seniors', action.seniorId);
  const appointment = action.appointmentId ? await store.get('appointments', action.appointmentId) : null;
  await handOver(senior, approved, appointment, await store.list('members', { circleId: senior.circleId }));
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
