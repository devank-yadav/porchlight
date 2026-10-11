// AI layer. Uses any OpenAI-compatible chat endpoint (Luminal, OpenAI, Groq, etc.)
// when LLM_BASE_URL + LLM_API_KEY + LLM_MODEL are set. Otherwise falls back to a
// rule-based mock so the demo always works offline.

const BASE = process.env.LLM_BASE_URL;
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;
export const llmEnabled = Boolean(BASE && KEY && MODEL);

async function chat(messages, { json = false, maxTokens = 300 } = {}) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: json ? 0.2 : 0.7, max_tokens: maxTokens }),
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
- Keep every reply to one or two short, warm sentences, then one simple question. Speak plainly; the listener may be hard of hearing.`;

function personaPrompt(senior) {
  return `You are Porchlight, a friendly daily check-in caller for ${senior.preferredName}, age ${senior.age}, who lives alone in ${senior.city}.
What the family told you about ${senior.preferredName}: ${senior.about.join(' ')}
Medications to gently ask about: ${senior.meds.map((m) => `${m.name} (${m.when})`).join(', ') || 'none'}.
Over the call, naturally cover: how she slept and feels, whether she has eaten and taken her pills, what she is up to, and whether she needs anything this week (rides, groceries, refills). Show real interest in her stories.
${RULES}`;
}

// ---------- Conversation ----------

export async function reply(senior, transcript) {
  if (llmEnabled) {
    try {
      const messages = [
        { role: 'system', content: personaPrompt(senior) },
        ...transcript.map((t) => ({ role: t.who === 'porchlight' ? 'assistant' : 'user', content: t.text })),
      ];
      return await chat(messages, { maxTokens: 120 });
    } catch (e) {
      console.warn('[llm] reply failed, using mock:', e.message);
    }
  }
  return mockReply(senior, transcript);
}

const SCAM_WORDS = /gift ?card|wire|bitcoin|crypto|bank (called|account)|social security|\bssn\b|irs|warrant|arrest|jail|bail|lottery|prize|you(’|')ve won|computer virus|tech support|grandson.*(trouble|jail)|keep it (a )?secret|verification code|medicare card/i;
const URGENT_WORDS = /\bfell\b|\bfall(en)?\b|can(’|')?t (get up|breathe)|chest pain|bleeding|dizzy|hit my head/i;
const RIDE_WORDS = /\bride\b|doctor|appointment|dentist|pharmacy|groceries|grocery|store|pick ?up|drive me/i;

function mockReply(senior, transcript) {
  const name = senior.preferredName;
  const last = [...transcript].reverse().find((t) => t.who === 'senior')?.text ?? '';
  const turns = transcript.filter((t) => t.who === 'senior').length;

  if (URGENT_WORDS.test(last)) return `Oh ${name}, I'm sorry. I'm letting ${senior.primaryContactName} know right now. If you're hurt or can't get up, please press your help button or call 911. Are you safe where you are?`;
  if (SCAM_WORDS.test(last)) return `That sounds like a scam, ${name}. Real banks and government offices never ask for gift cards or codes over the phone. Please don't send anything; I'll let ${senior.primaryContactName} know. Did you give them any information?`;
  if (RIDE_WORDS.test(last)) return `I'll ask the family to set up a ride for you, and someone will confirm. Is there anything else you need this week?`;

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

export function greeting(senior, opener) {
  return `${opener ? opener + ' ' : ''}Hi ${senior.preferredName}, it's Porchlight, your family's check-in helper. I'm an AI, and I'll never ask you for money or codes. How are you feeling today?`;
}

// ---------- Post-call analysis ----------

export async function analyze(senior, transcript) {
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
 "flags": [{"type": "urgent"|"scam"|"health"|"lonely"|"change", "severity": "high"|"medium"|"low", "text": "what she said, briefly"}],
 "starters": ["2-3 specific conversation starters for family based on what she talked about"],
 "stories": [{"title": "short", "text": "a memory she shared, in her words where possible"}],
 "requests": [{"type": "ride"|"groceries"|"refill"|"visit"|"errand"|"repair", "title": "short task", "when": "as she said it or null"}]}
Never diagnose. "change" means different from her usual.`,
          },
          { role: 'user', content: `About her: ${senior.about.join(' ')}\n\nCall transcript:\n${text}` },
        ],
        { json: true, maxTokens: 700 },
      );
      return normalize(parseJson(out));
    } catch (e) {
      console.warn('[llm] analyze failed, using mock:', e.message);
    }
  }
  return mockAnalyze(senior, transcript);
}

function normalize(a) {
  return {
    summary: a.summary || 'Check-in completed.',
    mood: ['good', 'okay', 'low'].includes(a.mood) ? a.mood : 'okay',
    medsTaken: typeof a.medsTaken === 'boolean' ? a.medsTaken : null,
    flags: Array.isArray(a.flags) ? a.flags : [],
    starters: Array.isArray(a.starters) ? a.starters.slice(0, 3) : [],
    stories: Array.isArray(a.stories) ? a.stories : [],
    requests: Array.isArray(a.requests) ? a.requests : [],
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

function mockAnalyze(senior, transcript) {
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
    if (/doctor|appointment|dentist/i.test(s)) requests.push({ type: 'ride', title: 'Ride to her appointment', when: (s.match(/(mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|next week/i) || [null])[0] });
    else if (/ride|drive me|church/i.test(s)) requests.push({ type: 'ride', title: 'Give her a ride', when: (s.match(/(mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow/i) || [null])[0] });
    if (/grocer|milk|bread|store/i.test(s)) requests.push({ type: 'groceries', title: 'Pick up groceries', when: null });
    if (/refill|pharmacy|out of (my )?(pills|medicine)|running low/i.test(s)) requests.push({ type: 'refill', title: 'Pick up her prescription refill', when: null });
  }

  const starters = TOPICS.filter(([re]) => re.test(all)).map(([, , s]) => s);
  if (starters.length < 2) starters.push(`Ask ${senior.preferredName} what the best part of her day was.`);

  const low = /sad|tired|lonely|not great|bad day|worn out|aches?/i.test(all);
  const good = /good|great|fine|lovely|wonderful|happy/i.test(all);
  const mood = low ? 'low' : good ? 'good' : 'okay';
  const medsTaken = /took (my|them|it)|yes.*(pill|med)|already took/i.test(all) ? true : /forgot|didn(’|')?t take/i.test(all) ? false : null;

  const topics = TOPICS.filter(([re]) => re.test(all)).map(([, t]) => t);
  const summary =
    `${senior.preferredName} sounded ${mood === 'good' ? 'cheerful' : mood === 'low' ? 'a bit down' : 'steady'} today` +
    (topics.length ? ` and talked about ${topics.slice(0, 2).join(' and ')}.` : '.') +
    (requests.length ? ` She asked for help with ${requests.map((r) => r.type).join(', ')}.` : '') +
    (flags.some((f) => f.type === 'scam') ? ' She mentioned a suspicious call.' : '');

  return { summary, mood, medsTaken, flags, starters: starters.slice(0, 3), stories, requests };
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
    [/wire|western union|zelle|bitcoin|crypto|cash app/i, 'Asked for money by wire, app or crypto'],
    [/code|pin|password|verification/i, 'Asked for a code or password'],
    [/social security|\bssn\b|medicare (card|number)|account number/i, 'Asked for personal ID numbers'],
    [/urgent|right now|immediately|today only|before it(’|')?s too late/i, 'Pushed you to act right away'],
    [/secret|don(’|')?t tell|keep (this|it) between/i, 'Told you to keep it secret'],
    [/arrest|warrant|jail|bail|police|irs|lawsuit/i, 'Threatened arrest or legal trouble'],
    [/won|prize|lottery|sweepstakes/i, 'Said you won a prize'],
    [/grandson|granddaughter|nephew|it(’|')?s me/i, 'Claimed to be a relative in trouble'],
    [/virus|computer|microsoft|apple support|remote access/i, 'Claimed your computer has a problem'],
  ];
  const redFlags = checks.filter(([re]) => re.test(description)).map(([, f]) => f);
  const verdict = redFlags.length >= 2 ? 'likely scam' : redFlags.length === 1 ? 'be careful' : 'probably fine';
  const advice =
    verdict === 'probably fine'
      ? "Nothing here looks like a common scam. If they ask for money or codes later, hang up and call family."
      : "Don't send money, gift cards or codes. Hang up and call the real number on your card or bill, or call your family first.";
  return { verdict, redFlags, advice };
}
