// OWNER: Person A (voice & AI).
// Turns spoken times into a Date: "at 4", "at 4:30 pm", "in 20 minutes", "in an hour",
// "tomorrow morning", "tonight". Times are her local time (her time zone).
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, half: 30 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);

// Local wall-clock parts for a time zone.
function partsIn(tz, d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}

// Her local Y-M-D h:mi → the real moment.
function localToDate(tz, y, m, d, h, mi) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = partsIn(tz, new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
  return new Date(guess - offset);
}

export function parseWhen(text, tz = 'America/New_York', now = new Date()) {
  const t = String(text || '').toLowerCase().replace(/\./g, '');
  const rel = t.match(/\bin (\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty-five|half an?) ?(minutes?|mins?|hours?)\b/);
  if (rel) {
    const n = rel[1].startsWith('half') ? 30 : num(rel[1].split(' ')[0]);
    const unit = rel[1].startsWith('half') ? 1 : /^h/.test(rel[2]) ? 60 : 1;
    if (n) return new Date(now.getTime() + n * unit * 60000);
  }
  const today = partsIn(tz, now);
  const tomorrow = /\btomorrow\b/.test(t);
  const at = t.match(/\b(?:at|around|by) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(am|pm|in the morning|in the afternoon|in the evening|tonight)?\b/);
  let h = null; let mi = 0;
  if (at) {
    h = num(at[1]); mi = at[2] ? +at[2] : 0;
    const ampm = at[3] || (/\bmorning\b/.test(t) ? 'am' : /\b(afternoon|evening|tonight)\b/.test(t) ? 'pm' : '');
    if (/pm|afternoon|evening|tonight/.test(ampm) && h < 12) h += 12;
    else if (/am|morning/.test(ampm) && h === 12) h = 0;
    else if (!ampm && h >= 1 && h <= 7) h += 12; // "at 4" means 4 in the afternoon
  } else if (/\btonight\b/.test(t)) h = 19;
  else if (tomorrow) h = /\bafternoon\b/.test(t) ? 14 : /\bevening\b/.test(t) ? 18 : 9;
  if (h === null || h > 23 || mi > 59) return null;
  let when = localToDate(tz, today.y, today.m, today.d + (tomorrow ? 1 : 0), h, mi);
  if (!tomorrow && when <= now) when = localToDate(tz, today.y, today.m, today.d + 1, h, mi);
  return when;
}

export function sayTime(date, tz = 'America/New_York', now = new Date()) {
  const time = date.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const day = (x) => x.toLocaleDateString('en-US', { timeZone: tz });
  const tmr = new Date(now.getTime() + 86400000);
  return day(date) === day(now) ? `at ${time}` : day(date) === day(tmr) ? `tomorrow at ${time}` : `${date.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' })} at ${time}`;
}
