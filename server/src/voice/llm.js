// AI layer. Uses any OpenAI-compatible chat endpoint (Luminal, OpenAI, Groq, etc.)
// when LLM_BASE_URL + LLM_API_KEY + LLM_MODEL are set. Otherwise falls back to a
// rule-based mock so the demo always works offline.

const BASE = process.env.LLM_BASE_URL;
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;
// The post-call summary/stories aren't time-critical, so they can use a stronger model (e.g. claude-sonnet-5-5).
const ANALYSIS_MODEL = process.env.LLM_ANALYSIS_MODEL || MODEL;
// Optional extra headers as JSON, e.g. a workspace header some providers need with user-level keys.
let EXTRA_HEADERS = {};
try { EXTRA_HEADERS = JSON.parse(process.env.LLM_HEADERS || '{}'); } catch { console.warn('[llm] LLM_HEADERS is not valid JSON; ignoring it'); }
export const llmEnabled = Boolean(BASE && KEY && MODEL);
// Newer Claude models (Haiku/Sonnet 5.5, Opus 5+, Fable) reject a custom temperature and think before
// answering. A caller is waiting, so they get low reasoning effort (LLM_REASONING_EFFORT, '' to omit).
const NO_SAMPLING = /claude-(haiku|sonnet)-5|claude-opus-5|claude-fable|claude-opus-4-[78]/i;
const EFFORT = process.env.LLM_REASONING_EFFORT ?? 'low';
function tuning(json, model = MODEL) {
  if (model && NO_SAMPLING.test(model)) return EFFORT ? { reasoning_effort: EFFORT } : {};
  return { temperature: json ? 0.2 : 0.7 };
}

async function chat(messages, { json = false, maxTokens = 300, model = MODEL } = {}) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...EXTRA_HEADERS },
    body: JSON.stringify({ model, messages, ...tuning(json, model), max_tokens: maxTokens + (NO_SAMPLING.test(model || '') ? 400 : 0) }),
    // A phone caller is waiting: give up and use the fallback rather than leave dead air.
    signal: AbortSignal.timeout(json ? 20000 : 8000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// Streaming version for live calls: calls onText(chunk) as words arrive. Returns the full text.
async function chatStream(messages, { maxTokens = 120, onText }) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...EXTRA_HEADERS },
    body: JSON.stringify({ model: MODEL, messages, ...tuning(false), max_tokens: maxTokens + (NO_SAMPLING.test(MODEL || '') ? 400 : 0), stream: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) { full += delta; if (onText(delta) === false) return full; }
      } catch { /* keep-alive or partial line */ }
    }
  }
  return full;
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in LLM output');
  return JSON.parse(text.slice(start, end + 1));
}

const RULES = (family) => `Rules you never break:
- You are an AI. Say so if asked.
- Never ask for money, passwords, PINs, codes, account or Social Security numbers.
- Never give medical advice or diagnoses. If something sounds urgent (a fall, chest pain, can't breathe), say you are letting the family know right now and suggest calling 911.
- Keep replies short and warm: usually one or two sentences and one simple question; up to three sentences when you're giving her something useful to do. Speak plainly; the listener may be hard of hearing.
Always do both: help her right now with one practical, safe thing she can do herself, AND say what you'll pass on to the family. Never just "I'll tell Anne".
- Not feeling well (headache, tired, dizzy, aches): be kind, offer simple comfort (a glass of water, sitting down to rest, a snack if she hasn't eaten), and say clearly that if it gets much worse, or feels sudden or different from usual, she should call her doctor, or 911 if it's serious. Never name a cause, a medicine or a dose.
- Lonely, bored or missing someone: in that same reply, acknowledge it AND offer one concrete thing: name a specific activity from the list below with its day and time ("The garden club meets Thursday at 2 at the library. Want me to tell ${family} you'd like to go?"), or offer "Want me to connect you to ${family} right now?". Don't just ask how she's feeling.
- Groceries, errands, repairs: say you'll ask the family who can help and you'll tell her who's coming once someone says yes. Ask what exactly she needs, and help with tonight ("Is there something in the freezer or pantry for dinner tonight?").
- When you give her steps to follow, give at most three, each short, with "first", "then", "and that's it".
- Say "your Porchlight screen", not "the app"; never say "notification" or "submit".
- Once per call, if no family question is waiting, invite one memory tied to what she's talking about ("Did you and Walt garden together?"). When she tells a story, ask about one vivid detail (a song, a smell, who was there); don't summarize it back.
- Bring up at most ONE thing from her last calls; never read her a list.
- Questions she asks you (the date, the weather, a word she forgot, how to do something simple): just answer helpfully if you can; if you don't know, say so.
How to sound like a person on the phone, not a form:
- React to what she actually said first ("Oh, a headache, that's no fun."), then move on. Use contractions and everyday words.
- Vary your openers ("Mm, I see.", "Oh, good.", "Ah.") and never start two replies the same way. At most one exclamation mark per call.
- Never ask about something she already answered. If she asks how you are, answer briefly and turn it back to her.
- If what she said seems garbled or doesn't make sense, gently check ("Sorry, did you say a headache?") rather than guessing.
- Porchlight CAN do these for her, and they're handled automatically when she asks: set up an Uber (a "Book my Uber" button on her screen), connect her to a family member by phone, pass a message to family, set a reminder, call her back later. Never say you can't do these, and don't promise anything else.`;

// Rides are pre-approved unless the family switched on "Ask me before booking rides" (askBeforeRides).
// Pre-approved: she books it herself with the Uber button on her screen, so Porchlight never says it's booked.
const rideReply = (senior) => (senior.askBeforeRides
  ? `Thank you for telling me. I'll ask ${senior.primaryContactName} about a ride and call you back once it's confirmed.`
  : `No problem. I've put a "Book my Uber" button on your Porchlight screen for that ride, with everything already filled in, and I'll let ${senior.primaryContactName} know you're going.`);

function appointmentLines(appointments = [], family, senior = {}) {
  const upcoming = appointments.filter((a) => new Date(a.startsAt) > new Date() && !a.cancelled).sort((x, y) => (x.startsAt > y.startsAt ? 1 : -1));
  if (!upcoming.length) return '';
  return `Upcoming appointments: ${upcoming.slice(0, 8).map((a) => `${a.title}${a.with ? ` with ${a.with}` : ''}${a.where ? ` at ${a.where}` : ''}, ${new Date(a.startsAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })} (transport: ${a.needsRide === false ? 'not needed' : a.transport || 'unknown'})`).join('; ')}.
If transport is not confirmed, ask once: "Do you have a ride to your appointment?" If she has no ride, say: "${rideReply({ ...senior, primaryContactName: family })}" Never say a ride is booked, arranged or confirmed.\n`;
}

// What Porchlight remembers between calls, so it can pick up threads like a person would.
function memoryLines(memory = {}) {
  const out = [];
  if (memory.recent?.length) out.push(`From her last calls (bring ONE of these up naturally early on, e.g. ask how it went): ${memory.recent.join(' | ')}`);
  if (memory.stories?.length) out.push(`Stories she has already told you (don't ask her to repeat them; you can mention one warmly): ${memory.stories.join('; ')}.`);
  if (memory.questions?.length) out.push(`Her family would love to hear about these. Ask ONE of them within your first three replies (after she's told you how she is), in your own words, saying who wondered: ${memory.questions.map((q) => `"${q.text}" (from ${q.from})`).join('; ')}.`);
  if (memory.askNow) out.push('IN THIS REPLY: write ONE short, warm sentence reacting to what she just said. No question at all; a question from her family follows your sentence.');
  if (memory.events?.length) out.push(`Things nearby she might enjoy (suggest one if she's lonely or bored): ${memory.events.join('; ')}.`);
  return out.length ? `${out.join('\n')}\n` : '';
}

function personaPrompt(senior, appointments, memory) {
  const now = new Date().toLocaleString('en-US', { timeZone: senior.timezone || 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `You are Porchlight, a friendly daily check-in caller for ${senior.preferredName}, age ${senior.age}, who lives alone in ${senior.city}.
Right now it is ${now} where she lives. If she asks the day, date or time, tell her exactly that.
What the family told you about ${senior.preferredName}: ${senior.about.join(' ')}
Medications to gently ask about: ${senior.meds.map((m) => `${m.name} (${m.when})`).join(', ') || 'none'}.
Over the call, naturally cover: how she slept and feels, whether she has eaten and taken her pills, what she is up to, and whether she needs anything this week (rides, groceries, refills). Show real interest in her stories: ask a follow-up about the people and places in them.
${memoryLines(memory)}${appointmentLines(appointments, senior.primaryContactName, senior)}If she isn't sure whether she took a pill, suggest she check her pill box for today's slot, tell her not to take another just in case, and that you'll let ${senior.primaryContactName} know.
${RULES(senior.primaryContactName)}`;
}

// ---------- Conversation ----------

// Backend safety policy (A3): these replies are fixed and run before the model, so a
// scam, an emergency or an unsure-pill answer always gets the same safe wording.
export function policyReply(senior, text, memory = {}) {
  const name = senior.preferredName;
  const family = senior.primaryContactName;
  if (URGENT_WORDS.test(text)) return `Oh ${name}, I'm sorry. I'm letting ${family} know right now. If you're hurt or can't get up, stay still, keep your phone close, and call 911 or press your help button. Are you safe where you are?`;
  if (SCAM_WORDS.test(text)) return `That sounds like a scam, ${name}, and you did the right thing telling me. Don't buy any gift cards or send money, and if they call back, just hang up. If you're worried about someone, call them on the number you already have, or I can put you through to ${family} right now. Did you give them any information?`;
  if (MED_UNSURE_WORDS.test(text)) return `That's okay, it happens to everyone. If you have a pill box, look at today's morning slot: if it's empty, you took it. If you can't tell, don't take an extra one just in case, and I'll let ${family} know so she can check with you. I'll remind you to look at your pill box on tomorrow's call. How are you feeling otherwise?`;
  if (NO_RIDE_WORDS.test(text)) return `${rideReply(senior)} Is there anything else you need this week?`;
  if (LONELY_WORDS.test(text)) {
    const e = memory.activity;
    if (e) return `I'm sorry it feels so quiet, ${name}. The ${e.title.toLowerCase()} is ${e.when.replace(/,\s*/, ' at ')} at the ${e.where}. Would you like me to tell ${family} you'd like to go? Or I can connect you to ${family} right now for a chat.`;
    return `I'm sorry it feels so quiet, ${name}. Would you like me to connect you to ${family} right now for a chat?`;
  }
  if (UNWELL_WORDS.test(text)) return `Oh, I'm sorry you're not feeling well, ${name}. A glass of water and a sit-down to rest might help a little. If it gets much worse, or feels sudden or different from usual, please call your doctor, or 911 if it's serious, and I'll let ${family} know so she can check on you. I'll also give you a quick call in a couple of hours to see how you're doing. Is there anything that would help right now?`;
  return null;
}

// Output guard: the model's reply is checked before Peggy hears it. Anything that
// claims a booking, asks for money/codes/ID, or reads like a diagnosis is dropped
// (null → rule-based fallback).
const CLAIMS_BOOKING = /\b(i('|’)ve|i have|we('|’)ve|it('|’)s|is|has been) (booked|scheduled|arranged|confirmed|set up)\b.*\b(ride|car|driver|pickup|pick-up)|\b(ride|car|driver|pickup)\b.*\b(is|has been) (booked|scheduled|arranged|confirmed|on (its|the) way)/i;
// Only the ride code puts the Uber button on her screen; the model claiming it would be a promise nobody kept.
const CLAIMS_BUTTON = /\b(put|added|placed|set up|i('|’)ll put|i('|’)ve put)\b.{0,30}book my uber|book my uber.{0,40}\b(filled in|ready)\b/i;
const ASKS_SECRETS = /\b(what('|’)s|tell me|give me|read me|share|confirm) (your|the)\b.*\b(password|pin|code|social security|ssn|account|card number|bank|medicare number|date of birth)/i;
const DIAGNOSES = /\byou (probably |might |may )?have (a |an )?(stroke|heart attack|infection|dementia|diabetes|covid|flu|uti)\b|\btake (another|an extra|two|double)\b.*\b(pill|dose|tablet)/i;
export function guardReply(senior, text) {
  const t = String(text || '').trim();
  if (!t || CLAIMS_BOOKING.test(t) || CLAIMS_BUTTON.test(t) || ASKS_SECRETS.test(t) || DIAGNOSES.test(t)) {
    if (t) console.warn('[llm] model reply blocked by guard:', t.slice(0, 120));
    return null;
  }
  return t;
}

// onSentence (live calls): each sentence is checked by the guard and handed over as soon as it's
// complete, so Porchlight starts speaking while the rest is still being written.
export async function reply(senior, transcript, { appointments = [], memory = {}, onSentence } = {}) {
  const last = [...transcript].reverse().find((t) => t.who === 'senior')?.text ?? '';
  const fixed = policyReply(senior, last, memory);
  if (fixed) { onSentence?.(fixed); return fixed; }
  // A family question goes out word for word after a short reaction, so it's always asked.
  if (memory.askNow) {
    const q = memory.askNow;
    const ask = `${q.from.split(',')[0]} asked me to ask you something: ${q.text.replace(/^\s*(ask (her|mom|mum|grandma) )?/i, '').replace(/^\w/, (c) => c.toUpperCase())}`;
    let react = 'Oh, that sounds nice.';
    if (llmEnabled) {
      try {
        const messages = [
          { role: 'system', content: personaPrompt(senior, appointments, memory) },
          ...transcript.map((t) => ({ role: t.who === 'porchlight' ? 'assistant' : 'user', content: t.text })),
        ];
        react = guardReply(senior, (await chat(messages, { maxTokens: 60 })).split(/(?<=[.!])\s/)[0].replace(/\?.*$/, '.')) || react;
      } catch (e) {
        console.warn('[llm] reaction failed:', e.message);
      }
    }
    const text = `${react} ${ask}`;
    onSentence?.(text);
    return text;
  }
  if (llmEnabled && onSentence) {
    const messages = [
      { role: 'system', content: personaPrompt(senior, appointments, memory) },
      ...transcript.map((t) => ({ role: t.who === 'porchlight' ? 'assistant' : 'user', content: t.text })),
    ];
    let pending = '';
    let spoken = '';
    let blocked = false;
    const flush = (final) => {
      // Sentence = up to . ! ? (or the end), at least a few words so TTS doesn't sound choppy.
      const re = final ? /^[\s\S]+$/ : /^[\s\S]*?[.!?](?=\s|$)/;
      let m;
      while (!blocked && (m = pending.match(re)) && m[0].trim()) {
        const sentence = m[0].trim();
        if (!final && sentence.split(/\s+/).length < 3 && pending.length === m[0].length) break;
        pending = pending.slice(m[0].length);
        if (!guardReply(senior, sentence)) { blocked = true; break; }
        spoken += (spoken ? ' ' : '') + sentence;
        onSentence(sentence);
        if (final) break;
      }
    };
    try {
      await chatStream(messages, { maxTokens: 120, onText: (t) => { pending += t; flush(false); return !blocked; } });
      flush(true);
    } catch (e) {
      console.warn('[llm] streamed reply failed:', e.message);
    }
    if (spoken) return spoken;
    const fallback = mockReply(senior, transcript);
    onSentence(fallback);
    return fallback;
  }
  if (llmEnabled) {
    try {
      const messages = [
        { role: 'system', content: personaPrompt(senior, appointments, memory) },
        ...transcript.map((t) => ({ role: t.who === 'porchlight' ? 'assistant' : 'user', content: t.text })),
      ];
      const answer = guardReply(senior, await chat(messages, { maxTokens: 120 }));
      if (answer) return answer;
      console.warn('[llm] empty reply, using fallback');
    } catch (e) {
      console.warn('[llm] reply failed, using mock:', e.message);
    }
  }
  const fallback = mockReply(senior, transcript);
  onSentence?.(fallback);
  return fallback;
}

// Word-bounded so "stairs", "first", "wired" or "fell asleep" never trip an alarm.
const SCAM_WORDS = /gift ?cards?|\bwire (the |some )?money|western union|\bbitcoin|\bcrypto(currency)?\b|bank (called|account|number)|social security (number|card)|\bssn\b|\birs\b|\bwarrant\b|\bbail\b|\barrest(ed)?\b|you(’|')?ve won|won (the|a) (lottery|sweepstakes|prize)|\blottery\b|computer virus|tech support|grand(son|daughter|kid).*(trouble|jail|arrest|accident|lawyer)|keep (it|this) (a )?secret|verification code|one.?time code|medicare (card|number)|pin number|password/i;
export const URGENT_WORDS = /\bfell (down|over|off|in|on|out|and|again|last|this|yesterday|today)\b|\bi fell\b(?! asleep)|\b(had|took) a (bad )?fall\b|\b(i('|’)ve|have) fallen\b|can(’|')?t (get up|breathe|stand up|move my)|chest (pain|hurts)|bleeding|hit my head|\bfainted\b|passed out/i;
const MED_UNSURE_WORDS = /(not sure|don(’|')?t (remember|know)|can(’|')?t remember|forget|forgot) (if|whether|about)? ?(i )?(took|taken|take)?.*(pill|med|tablet|dose)|(pill|med|tablet|dose).*(not sure|don(’|')?t remember|can(’|')?t remember)/i;
// Not urgent, but she's unwell: comfort + when to get help + family told. Urgent words are checked first.
const UNWELL_WORDS = /\b(head ?ache|migraine|dizzy|light.?headed|nause(a|ous)|sick to my stomach|feel(ing)? (sick|ill|unwell|poorly|awful|terrible|off)|not feeling (well|good|great)|under the weather|achy|aching|sore throat|a cough|coughing|fever)\b/i;
const LONELY_WORDS = /\b(lonely|lonesome|so quiet|all (by myself|alone)|nobody to talk|no one to talk|bored|miss (walt|him|my husband|everyone))\b/i;
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
    `What else is on your mind today, ${name}?`,
  ];
  return script[Math.min(turns, script.length - 1)];
}

// notices: confirmed facts since her last check-in (A7). Only confirmed facts are read out.
export function greeting(senior, opener, notices = [], { phone = false, reminders = [] } = {}) {
  const news = notices.slice(0, 2).map((n) => n.text.trim().replace(/([^.!?])$/, '$1.')).join(' ');
  // Reminders she asked for ("remind me to call the pharmacy tomorrow") come before the news.
  const remind = reminders.length ? ` You asked me to remind you to ${reminders.map((r) => r.what).join(', and to ')}.` : '';
  const goodNews = `${remind}${news ? ` Good news first: ${news}` : ''}`;
  // On a call every second counts: no family opener (a robot voice saying "it's Anne" confuses), shorter intro.
  if (phone) {
    const helper = senior.primaryContactName ? `${senior.primaryContactName}'s check-in helper` : 'your check-in helper';
    return `Hi ${senior.preferredName}, it's Porchlight, ${helper}. I'm an AI, and I never ask for money.${goodNews} How are you today?`;
  }
  return `${opener ? opener + ' ' : ''}Hi ${senior.preferredName}, it's Porchlight, your family's check-in helper. I'm an AI, and I'll never ask you for money or codes.${goodNews} How are you feeling today?`;
}

// ---------- Post-call analysis ----------

export async function analyze(senior, transcript, { appointments = [], questions = [] } = {}) {
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
 "stories": [{"title": "warm 3-6 word title", "text": "the memory retold in 1-3 sentences, first person, in her words where possible", "quote": "her single most vivid sentence, exactly as she said it", "about": ["people, places or decades in it"], "followUp": "one question the family could ask her to hear more", "question": "the family question this answers, copied exactly, or null", "summary": "one line, third person, e.g. How Peggy met Walt", "when": "the era or year she means, e.g. 1955, or null", "place": "where it happened, or null", "people": ["names she mentions"], "theme": "love"|"family"|"work"|"home"|"travel"|"food"|"faith"|"friends"|"childhood"|"music"|"garden"}],
 "requests": [{"type": "ride"|"groceries"|"refill"|"visit"|"errand"|"repair", "title": "short task", "when": "as she said it or null", "quote": "her exact words asking for it", "blocker": true if she has no way to do it herself (e.g. no ride to an appointment), else false}]}
Never diagnose. "change" means different from her usual. If she was unsure whether she took a pill, medStatus is "unsure" and add a "meds_unsure" flag.
A story is a memory from her life (people, places, how things used to be), not today's news. Only include real memories; [] if she told none.`,
          },
          { role: 'user', content: `About her: ${senior.about.join(' ')}\n${questions.length ? `Questions her family asked Porchlight to ask her: ${questions.map((q) => `"${q.text}"`).join('; ')}\n` : ''}\nCall transcript:\n${text}` },
        ],
        { json: true, maxTokens: 900, model: ANALYSIS_MODEL },
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
    stories: (Array.isArray(a.stories) ? a.stories : []).filter((st) => st && (st.text || st.quote)).map((st) => ({
      title: st.title || String(st.text || st.quote).split(/[.!?]/)[0].slice(0, 48),
      text: st.text || st.quote,
      quote: st.quote || null,
      about: Array.isArray(st.about) ? st.about.slice(0, 4) : [],
      followUp: st.followUp || st.askNext || null,
      question: st.question || null,
      // The app's story card reads these names (PR #51); askNext/people mirror followUp/about.
      askNext: st.followUp || st.askNext || null,
      people: Array.isArray(st.people) ? st.people.slice(0, 4) : (Array.isArray(st.about) ? st.about.filter((x) => /^[A-Z][a-z]+$/.test(x)).slice(0, 4) : []),
      summary: st.summary || null,
      when: st.when || null,
      place: st.place || null,
      theme: st.theme || null,
    })),
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
