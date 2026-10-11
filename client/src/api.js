async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  state: () => call('GET', '/api/state'),
  startCheckin: (seniorId) => call('POST', '/api/checkins', { seniorId, channel: 'app' }),
  say: (checkinId, text) => call('POST', `/api/checkins/${checkinId}/message`, { text }),
  finish: (checkinId) => call('POST', `/api/checkins/${checkinId}/finish`),
  ok: (seniorId) => call('POST', `/api/seniors/${seniorId}/ok`),
  help: (seniorId) => call('POST', `/api/seniors/${seniorId}/help`),
  missed: (seniorId) => call('POST', `/api/seniors/${seniorId}/missed`),
  resolve: (seniorId, memberId) => call('POST', `/api/seniors/${seniorId}/resolve`, { memberId }),
  phoneCall: (seniorId) => call('POST', `/api/seniors/${seniorId}/call`),
  scamCheck: (seniorId, text) => call('POST', '/api/scam-check', { seniorId, text }),
  addTask: (task) => call('POST', '/api/tasks', task),
  claim: (taskId, memberId) => call('POST', `/api/tasks/${taskId}/claim`, { memberId }),
  done: (taskId) => call('POST', `/api/tasks/${taskId}/done`),
  reset: () => call('POST', '/api/demo/reset'),
};

// ---- Browser voice (Chrome/Edge/Safari). Falls back to typing when missing. ----
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = Boolean(Recognition);

export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error('Voice input is not supported in this browser. Type instead.'));
    const r = new Recognition();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript);
    r.onerror = (e) => reject(new Error(e.error === 'no-speech' ? "I didn't hear anything. Try again." : `Microphone error: ${e.error}`));
    r.start();
  });
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    const voice = window.speechSynthesis.getVoices().find((v) => /Samantha|Google US English|Jenny|Aria/i.test(v.name));
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}
