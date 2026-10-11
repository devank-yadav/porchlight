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
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function sms(member, text) {
  const entry = { at: new Date().toISOString(), to: member.name, toId: member._id, text, delivered: 'logged' };
  feed.push(entry);
  // Only text real numbers; demo numbers start with +1555.
  if (twilioEnabled && member.phone && !member.phone.startsWith('+1555')) {
    try {
      await twilio('Messages.json', { To: member.phone, From: FROM, Body: `Porchlight: ${text}` });
      entry.delivered = 'sms';
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
  if (twilioEnabled && senior.phone && !senior.phone.startsWith('+1555')) {
    const say = String(text).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    try {
      await twilio('Calls.json', {
        To: senior.phone, From: FROM, // no Timeout: Twilio trial accounts reject it
        Twiml: `<Response><Say voice="${VOICE}">Hi ${senior.preferredName}, it's Porchlight. ${say} Have a good day.</Say></Response>`,
      });
      entry.delivered = 'call';
    } catch (e) {
      console.warn('[notify] tellSenior failed:', e.message);
      entry.delivered = 'failed';
    }
  }
  console.log(`[notify] -> ${senior.preferredName} (senior): ${text}`);
  return entry;
}
