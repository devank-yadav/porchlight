// Notifications. Sends real SMS through Twilio when configured, otherwise logs.
// Every message is also kept in memory so the UI can show a live feed.

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;
export const twilioEnabled = Boolean(SID && TOKEN && FROM);
// Phone voice. Google Chirp3-HD voices sound like a person; any Twilio <Say> voice works here
// (e.g. Polly.Joanna-Neural, Polly.Ruth-Generative). Override with TWILIO_VOICE in .env.
export const VOICE = process.env.TWILIO_VOICE || 'Google.en-US-Chirp3-HD-Aoede';

const feed = [];
export const recentNotifications = () => feed.slice(-30).reverse();

async function twilio(pathname, params) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000), // texts are sent mid-call: never let a slow Twilio stall her conversation
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// A short spoken call: Twilio rings the number and reads the message (sign-in codes, confirmed news).
export async function sayOnCall(to, message) {
  const say = String(message).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  return twilio('Calls.json', { To: to, From: FROM, Twiml: `<Response><Pause length="1"/><Say voice="${VOICE}">${say}</Say></Response>` });
}

// A message for someone in the circle: a phone notification on their Porchlight app (when they have
// one), and a text when Twilio has a number to send from.
export async function sms(member, text) {
  const entry = { at: new Date().toISOString(), to: member.name, toId: member._id, text, delivered: 'logged' };
  feed.push(entry);
  if (member.pushToken && await expoPush(member.pushToken, { title: 'Porchlight', body: text })) entry.delivered = 'push';
  // Only text real numbers; demo numbers start with +1555.
  if (twilioEnabled && member.phone && !member.phone.startsWith('+1555')) {
    try {
      await twilio('Messages.json', { To: member.phone, From: FROM, Body: `Porchlight: ${text}` });
      entry.delivered = entry.delivered === 'push' ? 'push+sms' : 'sms';
    } catch (e) {
      console.warn('[notify] SMS failed:', e.message);
      entry.delivered = 'failed';
    }
  }
  console.log(`[notify] -> ${member.name}: ${text}`);
  return entry;
}

export async function placeCall(to, twimlUrl, statusUrl) {
  return twilio('Calls.json', {
    To: to, From: FROM, Url: twimlUrl, StatusCallback: statusUrl,
    StatusCallbackEvent: 'completed', // no Timeout: Twilio trial accounts reject it
  });
}

// B → A: tell the senior a confirmed fact ("Mark is bringing your milk Thursday.").
// With Twilio on and a real number: a short spoken call. Otherwise it's logged, and the
// notice on her screen plus the next check-in greeting carry it.
export async function tellSenior(senior, text) {
  const entry = { at: new Date().toISOString(), to: senior.preferredName, toId: senior._id, text, delivered: 'logged' };
  feed.push(entry);
  // Already on a call with us (e.g. her ride confirmed mid-call): don't ring her a second time.
  // Her screen notice and the next greeting carry it.
  const onCall = (await import('../store.js')).list('checkins', { seniorId: senior._id, channel: 'phone', status: 'in-progress' })
    .then((rows) => rows.some((c) => Date.now() - new Date(c.startedAt).getTime() < 20 * 60000));
  if (twilioEnabled && senior.phone && !senior.phone.startsWith('+1555') && !(await onCall)) {
    try {
      await sayOnCall(senior.phone, `Hi ${senior.preferredName}, it's Porchlight. ${text} Have a good day.`);
      entry.delivered = 'call';
    } catch (e) {
      console.warn('[notify] tellSenior failed:', e.message);
      entry.delivered = 'failed';
    }
  }
  console.log(`[notify] -> ${senior.preferredName} (senior): ${text}`);
  return entry;
}

// Phone notification to the senior's iPhone through Expo's push service (token saved by the app).
// No token or offline → logged only, like texts.
export async function push(senior, { title, body, url }) {
  const entry = { at: new Date().toISOString(), to: senior.preferredName, toId: senior._id, text: `${title}: ${body}`, delivered: 'logged' };
  feed.push(entry);
  if (senior.pushToken) entry.delivered = (await expoPush(senior.pushToken, { title, body, url })) ? 'push' : 'failed';
  console.log(`[notify] -> ${senior.preferredName} (push): ${title}`);
  return entry;
}

async function expoPush(to, { title, body, url }) {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to, title, body, sound: 'default', data: url ? { url } : {} }),
      signal: AbortSignal.timeout(5000),
    });
    const out = await res.json().catch(() => ({}));
    if (out?.data?.status === 'ok') return true;
    console.warn('[notify] push failed:', JSON.stringify(out).slice(0, 200));
  } catch (e) {
    console.warn('[notify] push failed:', e.message);
  }
  return false;
}
