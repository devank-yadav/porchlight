// "I need help": everything the family needs in one alert. Where they are (from the phone, with a map
// link), when they pressed it, and what Porchlight knows from today: the last call, a recent scam
// worry, today's pills (only for people allowed to see medicines).
import * as store from '../store.js';
import * as meds from './meds.js';

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

// Metres between two points (haversine).
function distance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// location from the app: { lat, lng, accuracy?, address? } (address is the phone's own reverse lookup).
export function cleanLocation(input) {
  if (!input || typeof input !== 'object') return null;
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return null;
  return {
    lat, lng,
    accuracy: num(input.accuracy, 0, 100000),
    address: typeof input.address === 'string' ? input.address.slice(0, 200) : '',
    mapUrl: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent('Here')}`,
  };
}

export async function helpContext(senior, location) {
  const loc = cleanLocation(location);
  const [lat, lng] = String(senior.homeLatLng || '').split(',').map(Number);
  const nearHome = loc && Number.isFinite(lat) && Number.isFinite(lng) ? distance(loc, { lat, lng }) < 200 : null;
  const checkins = (await store.list('checkins', { seniorId: senior._id }))
    .filter((c) => c.status === 'completed' && c.summary)
    .sort((a, b) => new Date(b.endedAt || b.startedAt) - new Date(a.endedAt || a.startedAt));
  const last = checkins[0];
  const dayAgo = Date.now() - 86400000;
  const scam = (await store.list('scamChecks', { seniorId: senior._id }))
    .filter((s) => s.verdict !== 'probably fine' && new Date(s.createdAt).getTime() > dayAgo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const doses = senior.meds?.length ? await meds.medsToday(senior) : [];
  const taken = doses.filter((d) => d.status === 'taken').length;
  const missed = doses.filter((d) => d.status === 'missed').length;
  return {
    at: new Date().toISOString(),
    location: loc,
    nearHome,
    lastCall: last && new Date(last.endedAt || last.startedAt).getTime() > dayAgo ? { at: last.endedAt || last.startedAt, summary: String(last.summary).slice(0, 240) } : null,
    scam: scam ? { verdict: scam.verdict, what: String(scam.description || '').slice(0, 140) } : null,
    meds: doses.length ? { taken, missed, total: doses.length } : null,
  };
}

const timeIn = (iso, tz) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || 'America/New_York' });

function where(ctx) {
  if (!ctx?.location) return 'Location: not shared (location is off on their phone).';
  const place = ctx.location.address || (ctx.nearHome ? 'at home' : 'see map');
  return `Location: ${place}${ctx.nearHome && ctx.location.address ? ' (at home)' : ''}. Map: ${ctx.location.mapUrl}`;
}

// The written alert (push and text). Medicine status only for people who may see medicines.
export function helpText(senior, ctx, member, phone) {
  const name = senior.preferredName;
  const lines = [
    `URGENT: ${name} pressed "I need help" at ${timeIn(ctx?.at || new Date().toISOString(), senior.timezone)}.`,
    where(ctx),
    phone ? `Call ${name}: ${phone}.` : null,
    ctx?.lastCall ? `Last call (${timeIn(ctx.lastCall.at, senior.timezone)}): ${ctx.lastCall.summary}` : null,
    ctx?.scam ? `Scam worry today (${ctx.scam.verdict}): "${ctx.scam.what}"` : null,
    ctx?.meds && member?.seesMeds ? `Pills today: ${ctx.meds.taken} of ${ctx.meds.total} taken${ctx.meds.missed ? `, ${ctx.meds.missed} missed` : ''}.` : null,
    'Open Porchlight and tap "I’m on it" so the family knows. If you can’t reach them, call 911.',
  ];
  return lines.filter(Boolean).join('\n');
}

// The spoken alert on an automated call to family.
export function helpSpoken(senior, ctx) {
  const name = senior.preferredName;
  const place = !ctx?.location ? 'Their location wasn’t shared.'
    : ctx.nearHome ? 'Their phone is at home.'
      : ctx.location.address ? `Their phone is near ${ctx.location.address}.` : 'Their location is in the Porchlight app.';
  const one = `This is Porchlight, an automated call. ${name} pressed the I need help button. ${place} Please call ${name} now. If you can’t reach them, call 9 1 1.`;
  return `${one} Again: ${one} Open the Porchlight app to see the details and tap I’m on it.`;
}
