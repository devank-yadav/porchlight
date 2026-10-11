// Notifications. Sends real SMS through Twilio when configured, otherwise logs.
// Every message is also kept in memory so the UI can show a live feed.

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;
export const twilioEnabled = Boolean(SID && TOKEN && FROM);

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
    StatusCallbackEvent: 'completed', Timeout: '25',
  });
}
