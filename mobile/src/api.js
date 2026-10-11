import Constants from 'expo-constants';

// Where the Porchlight server lives.
// 1. EXPO_PUBLIC_API_URL (set in mobile/.env) wins, e.g. a deployed server or ngrok URL.
// 2. Otherwise use the laptop running `npx expo start` (same Wi-Fi), port 3001.
function resolveBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:3001`;
}
export const API_BASE = resolveBase();

async function call(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError' || /Network request failed/i.test(e.message)) {
      throw new Error(`Can’t reach the Porchlight server at ${API_BASE}. Check that it’s running and your phone is on the same Wi-Fi, or set EXPO_PUBLIC_API_URL.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // viewer = a family member id; the server hides meds/transcripts from people who shouldn't see them.
  state: (viewer) => call('GET', viewer ? `/api/state?viewer=${encodeURIComponent(viewer)}` : '/api/state'),
  startCheckin: (seniorId) => call('POST', '/api/checkins', { seniorId, channel: 'app' }),
  say: (checkinId, text) => call('POST', `/api/checkins/${checkinId}/message`, { text }),
  finish: (checkinId) => call('POST', `/api/checkins/${checkinId}/finish`),
  ok: (seniorId) => call('POST', `/api/seniors/${seniorId}/ok`),
  help: (seniorId) => call('POST', `/api/seniors/${seniorId}/help`),
  missed: (seniorId) => call('POST', `/api/seniors/${seniorId}/missed`),
  resolve: (seniorId, memberId) => call('POST', `/api/seniors/${seniorId}/resolve`, { memberId }),
  phoneCall: (seniorId) => call('POST', `/api/seniors/${seniorId}/call`),
  addQuestion: (seniorId, text, memberId) => call('POST', `/api/seniors/${seniorId}/questions`, { text, memberId }),
  setSchedule: (seniorId, schedule) => call('PUT', `/api/seniors/${seniorId}/schedule`, schedule),
  scamCheck: (seniorId, text) => call('POST', '/api/scam-check', { seniorId, text }),
  addTask: (task) => call('POST', '/api/tasks', task),
  claim: (taskId, memberId) => call('POST', `/api/tasks/${taskId}/claim`, { memberId }),
  done: (taskId) => call('POST', `/api/tasks/${taskId}/done`),
  approve: (actionId, memberId) => call('POST', `/api/actions/${actionId}/approve`, { memberId }),
  reject: (actionId, memberId) => call('POST', `/api/actions/${actionId}/reject`, { memberId }),
  complete: (actionId, memberId) => call('POST', `/api/actions/${actionId}/complete`, { memberId }),
  handoff: (taskId, from, to) => call('POST', `/api/tasks/${taskId}/handoff`, { from, to }),
  accept: (taskId, memberId) => call('POST', `/api/tasks/${taskId}/accept`, { memberId }),
  decline: (taskId, memberId) => call('POST', `/api/tasks/${taskId}/decline`, { memberId }),
  demoCall: (seniorId) => call('POST', '/api/demo/call', { seniorId }),
  reset: () => call('POST', '/api/demo/reset'),
};
