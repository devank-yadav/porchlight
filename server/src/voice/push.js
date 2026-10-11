// OWNER: Person A (voice & AI).
// Phone notifications for Peggy (Expo push). When Porchlight sets up her Uber, her phone
// buzzes with "Your Uber is ready to book"; tapping it opens Uber with the trip filled in.
// Works without any keys: the app registers its Expo push token, and we post to Expo's
// free push service. No token (or no network) just means no notification.
import * as store from '../store.js';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
// Kept in memory as well, so a demo reset (which re-seeds seniors) doesn't forget her phone.
const tokens = new Map();
const sent = new Set();
const startedAt = Date.now();

export async function savePushToken(seniorId, token) {
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(String(token || ''))) {
    const err = new Error('Not an Expo push token');
    err.status = 400;
    throw err;
  }
  tokens.set(seniorId, token);
  await store.update('seniors', seniorId, { pushToken: token }).catch(() => {});
  console.log(`[push] ${seniorId}'s phone registered for notifications.`);
}

export async function pushTo(seniorId, { title, body, data }) {
  const senior = await store.get('seniors', seniorId).catch(() => null);
  const to = tokens.get(seniorId) || senior?.pushToken;
  if (!to) {
    console.log(`[push] (no phone registered) ${title}: ${body}`);
    return false;
  }
  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to, title, body, data, sound: 'default', priority: 'high', interruptionLevel: 'time-sensitive' }),
      signal: AbortSignal.timeout(8000),
    });
    const out = await res.json().catch(() => ({}));
    const status = out?.data?.status || out?.data?.[0]?.status;
    if (status !== 'ok') console.warn('[push] Expo said:', JSON.stringify(out).slice(0, 300));
    else console.log(`[push] Sent to ${seniorId}: ${title}`);
    return status === 'ok';
  } catch (e) {
    console.warn('[push] failed:', e.message);
    return false;
  }
}

// The Uber is set up from a call (voice) or from a ride proposal (care); both leave a
// notice of kind 'uber' with the link. Watch for new ones and send each exactly once.
async function sweep() {
  const notices = await store.list('notices');
  for (const n of notices) {
    if (n.kind !== 'uber' || !n.uberLink || sent.has(n._id)) continue;
    sent.add(n._id);
    if (n.pushedAt || new Date(n.at).getTime() < startedAt) continue; // seed data and old ones
    await store.update('notices', n._id, { pushedAt: new Date().toISOString() }).catch(() => {});
    const action = n.actionId ? await store.get('actions', n.actionId).catch(() => null) : null;
    const to = action?.details?.to;
    pushTo(n.seniorId, {
      title: to ? `Your Uber to ${to} is ready` : 'Your Uber is ready to book',
      body: 'Tap here. Uber opens with your trip filled in, then press Request.',
      data: { url: n.uberLink, kind: 'uber', noticeId: n._id },
    });
  }
}

let timer;
export function startPushWatcher() {
  if (timer) return;
  timer = setInterval(() => sweep().catch((e) => console.warn('[push]', e.message)), 2000);
  timer.unref?.();
}
