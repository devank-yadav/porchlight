// AI layer. Uses any OpenAI-compatible chat endpoint (Luminal, OpenAI, Groq, etc.)
// when LLM_BASE_URL + LLM_API_KEY + LLM_MODEL are set. Otherwise falls back to a
// rule-based mock so the demo always works offline.

const BASE = process.env.LLM_BASE_URL;
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;
// Optional extra headers as JSON, e.g. a workspace header some providers need with user-level keys.
let EXTRA_HEADERS = {};
try { EXTRA_HEADERS = JSON.parse(process.env.LLM_HEADERS || '{}'); } catch { console.warn('[llm] LLM_HEADERS is not valid JSON; ignoring it'); }
export const llmEnabled = Boolean(BASE && KEY && MODEL);

async function chat(messages, { json = false, maxTokens = 300 } = {}) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...EXTRA_HEADERS },
    body: JSON.stringify({ model: MODEL, messages, temperature: json ? 0.2 : 0.7, max_tokens: maxTokens }),
    // A phone caller is waiting: give up and use the fallback rather than leave dead air.
    signal: AbortSignal.timeout(json ? 20000 : 8000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in LLM output');
  return JSON.parse(text.slice(start, end + 1));
}

const RULES = `Rules you never break:
- You are an AI. Say so if asked.
- Never ask for money, passwords, PINs, codes, account or Social Security numbers.
- Never give medical advice or diagnoses. If something sounds urgent (a fall, chest pain, can't breathe), say you are letting the family know right now and suggest calling 911.
- Keep every reply to one or two short, warm sentences, then one simple question. Speak plainly; the listener may be hard of hearing.
How to sound like a person on the phone, not a form:
- React to what she actually said first ("Oh, a headache, that's no fun."), then move on. Use contractions and everyday words.
- Vary your openers ("Mm, I see.", "Oh, good.", "Ah.") and never start two replies the same way. At most one exclamation mark per call.
- Never ask about something she already answered. If she asks how you are, answer briefly and turn it back to her.
- If what she said seems garbled or doesn't make sense, gently check ("Sorry, did you say a headache?") rather than guessing.
- She can ask you to connect her to family or pass on a message; that's handled for you, so don't promise anything else.`;

function appointmentLines(appointments = [], family) {
  const upcoming = appointments.filter((a) => new Date(a.startsAt) > new Date());
  if (!upcoming.length) return '';
  return `Upcoming appointments: ${upcoming.map((a) => `${a.title} with ${a.with} at ${a.where}, ${new Date(a.startsAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })} (transport: ${a.transport || 'unknown'})`).join('; ')}.
If transport is not confirmed, ask once: "Do you have a ride to your appointment?" If she has no ride, say you'll ask ${family} and call her back once it's confirmed. Never say a ride is booked or arranged.\n`;
}

function personaPrompt(senior, appointments) {
  return `You are Porchlight, a friendly daily check-in caller for ${senior.preferredName}, age ${senior.age}, who lives alone in ${senior.city}.
What the family told you about ${senior.preferredName}: ${senior.about.join(' ')}
Medications to gently ask about: ${senior.meds.map((m) => `${m.name} (${m.when})`).join(', ') || 'none'}.
Over the call, naturally cover: how she slept and feels, whether she has eaten and taken her pills, what she is up to, and whether she needs anything this week (rides, groceries, refills). Show real interest in her stories.
${appointmentLines(appointments, senior.primaryContactName)}If she isn't sure whether she took a pill, say "That's okay, I'll let ${senior.primaryContactName} know so she can check with you." Never suggest taking another dose.
${RULES}`;
}

// ---------- Conversation ----------

// Backend safety policy (A3): these replies are fixed and run before the model, so a
// scam, an emergency or an unsure-pill answer always gets the same safe wording.
export function policyReply(senior, text) {
  const name = senior.preferredName;
  const family = senior.primaryContactName;
  if (URGENT_WORDS.test(text)) return `Oh ${name}, I'm sorry. I'm letting ${family} know right now. If you're hurt or can't get up, please press your help button or call 911. Are you safe where you are?`;
  if (SCAM_WORDS.test(text)) return `That sounds like a scam, ${name}. Real banks and government offices never ask for gift cards, money or codes over the phone. Please don't send anything or share any codes; I'll let ${family} know. Did you give them any information?`;
  if (MED_UNSURE_WORDS.test(text)) return `That's okay, ${name}. I'll let ${family} know so she can check with you. Please don't take an extra one just in case. How are you feeling otherwise?`;
  if (NO_RIDE_WORDS.test(text)) return `Thank you for telling me. I'll ask ${family} about a ride and call you back once it's confirmed. Is there anything else you need this week?`;
  return null;
}

// Output guard: the model's reply is checked before Peggy hears it. Anything that
// claims a booking, asks for money/codes/ID, or reads like a diagnosis is dropped
// (null → rule-based fallback).
const CLAIMS_BOOKING = /\b(i('|’)ve|i have|we('|’)ve|it('|’)s|is|has been) (booked|scheduled|arranged|confirmed|set up)\b.*\b(ride|car|driver|pickup|pick-up)|\b(ride|car|driver|pickup)\b.*\b(is|has been) (booked|scheduled|arranged|confirmed|on (its|the) way)/i;
const ASKS_SECRETS = /\b(what('|’)s|tell me|give me|read me|share|confirm) (your|the)\b.*\b(password|pin|code|social security|ssn|account|card number|bank|medicare number|date of birth)/i;
const DIAGNOSES = /\byou (probably |might |may )?have (a |an )?(stroke|heart attack|infection|dementia|diabetes|covid|flu|uti)\b|\btake (another|an extra|two|double)\b.*\b(pill|dose|tablet)/i;
export function guardReply(senior, text) {
  const t = String(text || '').trim();
  if (!t || CLAIMS_BOOKING.test(t) || ASKS_SECRETS.test(t) || DIAGNOSES.test(t)) {
    if (t) console.warn('[llm] model reply blocked by guard:', t.slice(0, 120));
    return null;
  }
  return t;
}

export async function reply(senior, transcript, { appointments = [] } = {}) {
  const last = [...transcript].reverse().find((t) => t.who === 'senior')?.text ?? '';
  const fixed = policyReply(senior, last);
  if (fixed) return fixed;
  if (llmEnabled) {
    try {
      const messages = [
        { role: 'system', content: personaPrompt(senior, appointments) },
        ...transcript.map((t) => ({ role: t.who === 'porchlight' ? 'assistant' : 'user', content: t.text })),
      ];
      const answer = guardReply(senior, await chat(messages, { maxTokens: 120 }));
      if (answer) return answer;
    } catch (e) {
      console.warn('[llm] reply failed, using mock:', e.message);
    }
  }
  return mockReply(senior, transcript);
}

// Word-bounded so "stairs", "first", "wired" or "fell asleep" never trip an alarm.
const SCAM_WORDS = /gift ?cards?|\bwire (the |some )?money|western union|\bbitcoin|\bcrypto(currency)?\b|bank (called|account|number)|social security (number|card)|\bssn\b|\birs\b|\bwarrant\b|\bbail\b|\barrest(ed)?\b|you(’|')?ve won|won (the|a) (lottery|sweepstakes|prize)|\blottery\b|computer virus|tech support|grand(son|daughter|kid).*(trouble|jail|arrest|accident|lawyer)|keep (it|this) (a )?secret|verification code|one.?time code|medicare (card|number)|pin number|password/i;
export const URGENT_WORDS = /\bfell (down|over|off|in|on|out|and|again|last|this|yesterday|today)\b|\bi fell\b(?! asleep)|\b(had|took) a (bad )?fall\b|\b(i('|’)ve|have) fallen\b|can(’|')?t (get up|breathe|stand up|move my)|chest (pain|hurts)|bleeding|hit my head|\bfainted\b|passed out/i;
const MED_UNSURE_WORDS = /(not sure|don(’|')?t (remember|know)|can(’|')?t remember|forget|forgot) (if|whether|about)? ?(i )?(took|taken|take)?.*(pill|med|tablet|dose)|(pill|med|tablet|dose).*(not sure|don(’|')?t remember|can(’|')?t remember)/i;
const NO_RIDE_WORDS = /(don(’|')?t|do not|no) (have )?(a )?ride|no way to get|can(’|')?t get there|nobody to (drive|take) me/i;
const RIDE_WORDS = /\bride\b|doctor|appointment|dentist|pharmacy|groceries|grocery|store|pick ?up|drive me/i;

function mockReply(senior, transcript) {
  const name = senior.preferredName;
  const last = [...transcript].reverse().find((t) => t.who === 'senior')?.text ?? '';
  const turns = transcript.filter((t) => t.who === 'senior').length;

  if (URGENT_WORDS.test(last)) return `Oh ${name}, I'm sorry. I'm letting ${senior.primaryContactName} know right now. If you're hurt or can't get up, please press your help button or call 911. Are you safe where you are?`;
  if (SCAM_WORDS.test(last)) return `That sounds like a scam, ${name}. Real banks and government offices never ask for gift cards or codes over the phone. Please don't send anything; I'll let ${senior.primaryContactName} know. Did you give them any information?`;
  if (/lonely|alone|nobody|no one (calls|visits)/i.test(last)) return `I'm really glad you told me, ${name}. I'll let ${senior.primaryContactName} know you'd love a call or a visit. What would make today a little nicer?`;
  if (/milk|bread|eggs|grocer|out of|run(ning)? (out|low)|broken|fix/i.test(last)) return `I'll pass that to your family, and I'll tell you who's helping once someone says yes. Is there anything else you need this week?`;
  if (RIDE_WORDS.test(last)) return `I'll ask ${senior.primaryContactName} about that and call you back once it's confirmed. Is there anything else you need this week?`;

  const script = [
    `How did you sleep last night, ${name}?`,
    `Glad to hear it. Have you had something to eat today, and taken your ${senior.meds[0]?.name ?? 'morning pills'}?`,
    `Good. What are you up to today?`,
    `That sounds lovely. Tell me more about that, I'd love to hear it.`,
    `Do you need anything this week, like a ride, groceries, or a refill?`,
    `It's been so nice talking with you, ${name}. I'll tell ${senior.primaryContactName} you said hello. Talk tomorrow!`,
  ];
  return script[Math.min(turns, script.length - 1)];
}

// notices: confirmed facts since her last check-in (A7). Only confirmed facts are read out.
export function greeting(senior, opener, notices = [], { phone = false } = {}) {
  const news = notices.slice(0, 2).map((n) => n.text.trim().replace(/([^.!?])$/, '$1.')).join(' ');
  const goodNews = news ? ` Good news first: ${news}` : '';
  // On a call every second counts: no family opener (a robot voice saying "it's Anne" confuses), shorter intro.
  if (phone) {
    const helper = senior.primaryContactName ? `${senior.primaryContactName}'s check-in helper` : 'your check-in helper';
    return `Hi ${senior.preferredName}, it's Porchlight, ${helper}. I'm an AI, and I never ask for money.${goodNews} How are you today?`;
  }
  return `${opener ? opener + ' ' : ''}Hi ${senior.preferredName}, it's Porchlight, your family's check-in helper. I'm an AI, and I'll never ask you for money or codes.${goodNews} How are you feeling today?`;
}

// ---------- Post-call analysis ----------

export async function analyze(senior, transcript, { appointments = [] } = {}) {
  if (llmEnabled) {
    try {
      const text = transcript.map((t) => `${t.who === 'porchlight' ? 'Porchlight' : senior.preferredName}: ${t.text}`).join('\n');
      const out = await chat(
        [
          {
            role: 'system',
            content: `You summarize a daily check-in call with an older adult for her family. Output ONLY JSON with this shape:
{"summary": "2 sentences, plain and kind",
 "mood": "good" | "okay" | "low",
 "medsTaken": true | false | null,
 "medStatus": "taken" | "not_taken" | "unsure" | "no_answer",
 "flags": [{"type": "urgent"|"scam"|"health"|"lonely"|"change"|"meds_unsure", "severity": "high"|"medium"|"low", "text": "what she said, briefly"}],
 "starters": ["2-3 specific conversation starters for family based on what she talked about"],
 "stories": [{"title": "short", "text": "a memory she shared, in her words where possible"}],
 "requests": [{"type": "ride"|"groceries"|"refill"|"visit"|"errand"|"repair", "title": "short task", "when": "as she said it or null", "quote": "her exact words asking for it", "blocker": true if she has no way to do it herself (e.g. no ride to an appointment), else false}]}
Never diagnose. "change" means different from her usual. If she was unsure whether she took a pill, medStatus is "unsure" and add a "meds_unsure" flag.`,
          },
          { role: 'user', content: `About her: ${senior.about.join(' ')}\n\nCall transcript:\n${text}` },
        ],
        { json: true, maxTokens: 700 },
      );
      return normalize(parseJson(out), transcript);
    } catch (e) {
      console.warn('[llm] analyze failed, using mock:', e.message);
    }
  }
  return mockAnalyze(senior, transcript, appointments);
}

const MED_STATUSES = ['taken', 'not_taken', 'unsure', 'no_answer'];
const medStatusFrom = (medsTaken) => (medsTaken === true ? 'taken' : medsTaken === false ? 'not_taken' : 'no_answer');

function normalize(a, transcript) {
  const said = transcript.filter((t) => t.who === 'senior').map((t) => t.text);
  const requests = (Array.isArray(a.requests) ? a.requests : []).map((r) => ({
    ...r,
    quote: r.quote || said.find((s) => RIDE_WORDS.test(s) || /milk|grocer|refill|fix|broken/i.test(s)) || said[said.length - 1] || '',
    blocker: Boolean(r.blocker),
  }));
  const flags = Array.isArray(a.flags) ? a.flags : [];
  const unsure = a.medStatus === 'unsure' || said.some((s) => MED_UNSURE_WORDS.test(s));
  if (unsure && !flags.some((f) => f.type === 'meds_unsure')) flags.push({ type: 'meds_unsure', severity: 'medium', text: said.find((s) => MED_UNSURE_WORDS.test(s)) || 'Not sure about her pills' });
  return {
    medStatus: unsure ? 'unsure' : MED_STATUSES.includes(a.medStatus) ? a.medStatus : medStatusFrom(a.medsTaken),
    summary: a.summary || 'Check-in completed.',
    mood: ['good', 'okay', 'low'].includes(a.mood) ? a.mood : 'okay',
    medsTaken: typeof a.medsTaken === 'boolean' ? a.medsTaken : null,
    flags,
    starters: Array.isArray(a.starters) ? a.starters.slice(0, 3) : [],
    stories: Array.isArray(a.stories) ? a.stories : [],
    requests,
  };
}

const TOPICS = [
  [/garden|tomato|flower|roses|plants/i, 'her garden', 'Ask how the garden is doing and what she wants to plant next.'],
  [/crossword|puzzle|sudoku/i, 'puzzles', 'Send her a tricky crossword clue and ask her to call you with the answer.'],
  [/walt|husband|wife/i, 'family memories', 'Ask her to tell you how she and Walt met. She loves telling it.'],
  [/maya|grand(kid|daughter|son|child)/i, 'the grandkids', 'Have the grandkids record her a short voice message today.'],
  [/music|band|song|radio|sinatra|dance/i, 'music', 'Play her favorite big band song on your next call and ask what it reminds her of.'],
  [/church|choir|friend|club/i, 'her friends', 'Ask about her friends from church and whether she would like a ride on Sunday.'],
  [/cook|bake|pie|recipe|soup/i, 'cooking', 'Ask for her recipe. Writing it down together is a good call.'],
  [/book|reading|library/i, 'reading', 'Ask what she is reading and offer to pick up the next one from the library.'],
];

function mockAnalyze(senior, transcript, appointments = []) {
  const said = transcript.filter((t) => t.who === 'senior').map((t) => t.text);
  const all = said.join(' ');
  const flags = [];
  const requests = [];
  const stories = [];

  for (const s of said) {
    if (URGENT_WORDS.test(s)) flags.push({ type: 'urgent', severity: 'high', text: s });
    if (SCAM_WORDS.test(s)) flags.push({ type: 'scam', severity: 'high', text: s });
    if (/lonely|alone|nobody|no one (calls|visits)|bored/i.test(s)) flags.push({ type: 'lonely', severity: 'medium', text: s });
    if (/didn(’|')?t sleep|couldn(’|')?t sleep|not hungry|didn(’|')?t eat|confused|forgot/i.test(s)) flags.push({ type: 'change', severity: 'medium', text: s });
    if (/remember|used to|when i was|back in|years ago/i.test(s)) stories.push({ title: s.split(/[.!?]/)[0].slice(0, 48), text: s });
    if (MED_UNSURE_WORDS.test(s)) flags.push({ type: 'meds_unsure', severity: 'medium', text: s });
    const blocker = NO_RIDE_WORDS.test(s);
    if (/doctor|appointment|dentist|cardiolog/i.test(s) || (blocker && appointments.length)) requests.push({ type: 'ride', title: 'Ride to her appointment', when: (s.match(/(mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|next week/i) || [appointments.length ? 'tomorrow' : null])[0], quote: s, blocker });
    else if (/\bride\b|drive me|church/i.test(s)) requests.push({ type: 'ride', title: 'Give her a ride', when: (s.match(/(mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow/i) || [null])[0], quote: s, blocker });
    if (/grocer|milk|bread|store/i.test(s)) requests.push({ type: 'groceries', title: /milk/i.test(s) ? 'Bring her milk' : 'Pick up groceries', when: null, quote: s, blocker: false });
    if (/refill|pharmacy|out of (my )?(pills|medicine)|running low/i.test(s)) requests.push({ type: 'refill', title: 'Pick up her prescription refill', when: null, quote: s, blocker: false });
  }

  const starters = TOPICS.filter(([re]) => re.test(all)).map(([, , s]) => s);
  if (starters.length < 2) starters.push(`Ask ${senior.preferredName} what the best part of her day was.`);

  const low = /sad|tired|lonely|not great|bad day|worn out|aches?/i.test(all);
  const good = /good|great|fine|lovely|wonderful|happy/i.test(all);
  const mood = low ? 'low' : good ? 'good' : 'okay';
  const unsure = said.some((s) => MED_UNSURE_WORDS.test(s));
  const medsTaken = unsure ? null : /took (my|them|it)|yes.*(pill|med)|already took/i.test(all) ? true : /forgot|didn(’|')?t take/i.test(all) ? false : null;
  const medStatus = unsure ? 'unsure' : medStatusFrom(medsTaken);

  const topics = TOPICS.filter(([re]) => re.test(all)).map(([, t]) => t);
  const summary =
    `${senior.preferredName} sounded ${mood === 'good' ? 'cheerful' : mood === 'low' ? 'a bit down' : 'steady'} today` +
    (topics.length ? ` and talked about ${topics.slice(0, 2).join(' and ')}.` : '.') +
    (requests.length ? ` She asked for help with ${[...new Set(requests.map((r) => ({ ride: 'a ride', groceries: 'groceries', refill: 'a refill' }[r.type] || r.type)))].join(' and ')}.` : '') +
    (flags.some((f) => f.type === 'scam') ? ' She mentioned a suspicious call.' : '') +
    (unsure ? " She wasn't sure whether she took her pill." : '');

  return { summary, mood, medsTaken, medStatus, flags, starters: starters.slice(0, 3), stories, requests };
}

// ---------- Scam check ----------

export async function scamCheck(description) {
  if (llmEnabled) {
    try {
      const out = await chat(
        [
          {
            role: 'system',
            content: `An older adult describes a call, text, email or letter they received. Decide if it is likely a scam. Output ONLY JSON:
{"verdict": "likely scam" | "be careful" | "probably fine",
 "redFlags": ["short plain phrases"],
 "advice": "2 short sentences for her, kind and clear. Always: don't send money, gift cards or codes; hang up and call the real number on your card or bill, or call family."}`,
          },
          { role: 'user', content: description },
        ],
        { json: true, maxTokens: 300 },
      );
      return parseJson(out);
    } catch (e) {
      console.warn('[llm] scamCheck failed, using mock:', e.message);
    }
  }
  const checks = [
    [/gift ?card|itunes|google play card/i, 'Asked for gift cards'],
    [/\bwire\b|western union|\bzelle\b|\bbitcoin|\bcrypto|cash app/i, 'Asked for money by wire, app or crypto'],
    [/\bcodes?\b|\bpin\b|password|verification/i, 'Asked for a code or password'],
    [/social security|\bssn\b|medicare (card|number)|account number/i, 'Asked for personal ID numbers'],
    [/urgent|right now|immediately|today only|before it(’|')?s too late/i, 'Pushed you to act right away'],
    [/secret|don(’|')?t tell|keep (this|it) between/i, 'Told you to keep it secret'],
    [/\barrest|\bwarrant\b|\bjail\b|\bbail\b|\bpolice\b|\birs\b|lawsuit/i, 'Threatened arrest or legal trouble'],
    [/\byou(’|')?ve won\b|\bwon (a|the)\b|\bprize\b|lottery|sweepstakes/i, 'Said you won a prize'],
    [/(grandson|granddaughter|grandkid|nephew|niece|it(’|')?s me).*(trouble|jail|accident|money|lawyer|hospital|bail)/i, 'Claimed to be a relative in trouble'],
    [/\bvirus|computer (is|has|problem)|microsoft|apple support|remote access/i, 'Claimed your computer has a problem'],
  ];
  const redFlags = checks.filter(([re]) => re.test(description)).map(([, f]) => f);
  const verdict = redFlags.length >= 2 ? 'likely scam' : redFlags.length === 1 ? 'be careful' : 'probably fine';
  const advice =
    verdict === 'probably fine'
      ? "Nothing here looks like a common scam. If they ask for money or codes later, hang up and call family."
      : "Don't send money, gift cards or codes. Hang up and call the real number on your card or bill, or call your family first.";
  return { verdict, redFlags, advice };
}
