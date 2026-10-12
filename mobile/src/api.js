import Constants from 'expo-constants';
import { sessionToken, sessionExpired } from './session';

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
  const token = sessionToken();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) sessionExpired();
    if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}). Please try again.`), { status: res.status });
    return data;
  } catch (e) {
    if (e.name === 'AbortError' || /Network request failed|Failed to fetch/i.test(e.message)) {
      throw new Error('Can’t reach Porchlight right now. Check your internet connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Sign-in and setup (server/src/account). role: 'senior' | 'family'.
  startSignIn: (phone, role) => call('POST', '/api/auth/start', { phone, role }),
  verify: (phone, role, code) => call('POST', '/api/auth/verify', { phone, role, code, device: `${Constants.deviceName || 'iPhone'}` }),
  signOut: () => call('POST', '/api/auth/logout'),
  me: () => call('GET', '/api/me'),
  deleteAccount: () => call('DELETE', '/api/me'),
  setupSenior: (body) => call('POST', '/api/setup/senior', body),
  setupFamily: (body) => call('POST', '/api/setup/family', body),
  setupParent: (body) => call('POST', '/api/setup/family/parent', body),
  joinCircle: (body) => call('POST', '/api/setup/family/join', body),
  invite: () => call('POST', '/api/circle/invites'),
  addPerson: (person) => call('POST', '/api/circle/members', person),
  editPerson: (id, patch) => call('PATCH', `/api/circle/members/${id}`, patch),
  removePerson: (id) => call('DELETE', `/api/circle/members/${id}`),
  editSenior: (patch) => call('PATCH', '/api/senior', patch),
  savePushToken: (token) => call('POST', '/api/me/push-token', { token }),

  // Everything for this account's care circle (the server filters by who is signed in).
  state: () => call('GET', '/api/state'),
  syncCalendar: (seniorId, body) => call('POST', `/api/seniors/${seniorId}/calendar`, body),
  // location: { lat, lng, accuracy, address } when the phone shares it (location.js).
  help: (seniorId, location) => call('POST', `/api/seniors/${seniorId}/help`, { location }),
  onIt: (seniorId) => call('POST', `/api/seniors/${seniorId}/help/ack`),
  resolve: (seniorId) => call('POST', `/api/seniors/${seniorId}/resolve`),
  // purpose 'scam': the call asks what happened and says whether it sounds like a scam.
  phoneCall: (seniorId, purpose = 'checkin') => call('POST', `/api/seniors/${seniorId}/call`, { purpose }),
  addQuestion: (seniorId, text) => call('POST', `/api/seniors/${seniorId}/questions`, { text }),
  deleteQuestion: (seniorId, qid) => call('DELETE', `/api/seniors/${seniorId}/questions/${qid}`),
  setSchedule: (seniorId, schedule) => call('PUT', `/api/seniors/${seniorId}/schedule`, schedule),
  addTask: (task) => call('POST', '/api/tasks', task),
  claim: (taskId) => call('POST', `/api/tasks/${taskId}/claim`),
  done: (taskId) => call('POST', `/api/tasks/${taskId}/done`),
  approve: (actionId) => call('POST', `/api/actions/${actionId}/approve`),
  reject: (actionId) => call('POST', `/api/actions/${actionId}/reject`),
  complete: (actionId) => call('POST', `/api/actions/${actionId}/complete`),
  handoff: (taskId, to) => call('POST', `/api/tasks/${taskId}/handoff`, { to }),
  accept: (taskId) => call('POST', `/api/tasks/${taskId}/accept`),
  decline: (taskId) => call('POST', `/api/tasks/${taskId}/decline`),
  // Medications (server/src/care/meds.js). med = { name, dose, times: ['08:00'] }.
  addMed: (seniorId, med) => call('POST', `/api/seniors/${seniorId}/meds`, med),
  editMed: (seniorId, medId, med) => call('PATCH', `/api/seniors/${seniorId}/meds/${medId}`, med),
  removeMed: (seniorId, medId) => call('DELETE', `/api/seniors/${seniorId}/meds/${medId}`),
  takeDose: (seniorId, medId, time, date) => call('POST', `/api/seniors/${seniorId}/doses`, { medId, time, date }),
  undoDose: (seniorId, medId, time, date) => call('DELETE', `/api/seniors/${seniorId}/doses`, { medId, time, date }),
};
