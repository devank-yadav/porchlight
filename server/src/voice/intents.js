// OWNER: Person A (voice & AI).
// Things Peggy can get done just by saying them on a check-in:
//   "Tell Mark thanks for the milk"      → Mark gets a text with her words, and she hears them read back.
//   "Put me through to Anne"              → on a phone call, Porchlight connects her live to Anne.
// Rule-based (works with no AI key) and checked before the model replies.
import * as store from '../store.js';
import * as audit from '../care/audit.js';
import { sms } from './notify.js';

const RELATIONS = { daughter: /daughter/i, son: /\bson\b/i, neighbor: /neighbou?r/i, neighbour: /neighbou?r/i, volunteer: /volunteer/i };

// "Anne", "my daughter", "Mark" → a circle member.
function findMember(word, members) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return null;
  const first = (m) => m.name.split(' ')[0].toLowerCase();
  return members.find((m) => first(m) === w)
    // Speech-to-text hears "Anne" as "Annie" or "Ann": accept a close spelling with the same start.
    || members.find((m) => first(m).slice(0, 3) === w.slice(0, 3) && Math.abs(first(m).length - w.length) <= 1)
    || (RELATIONS[w] && members.find((m) => RELATIONS[w].test(m.relation || '')))
    || null;
}

const CONNECT = /\b(?:put me through to|connect me (?:to|with)|(?:can|could|would) you (?:please )?(?:call|ring|get|dial)|please (?:call|ring|dial)|i(?:'|’)?d like to (?:talk|speak) (?:to|with)|i want to (?:talk|speak) (?:to|with)|let me (?:talk|speak) (?:to|with))\s+(?:my\s+)?([a-z]+)/i;
const MESSAGE = /\b(?:tell|text|message)\s+(?:my\s+)?([a-z]+)\s*,?\s*(?:that\s+)?(.{3,})$/i;
const LET_KNOW = /\blet\s+(?:my\s+)?([a-z]+)\s+know\s*,?\s*(?:that\s+)?(.{3,})$/i;

export function detectIntent(text, members) {
  const t = String(text || '').trim();
  const c = t.match(CONNECT);
  if (c) {
    const member = findMember(c[1], members);
    if (member) return { kind: 'connect', member };
  }
  const m = t.match(MESSAGE) || t.match(LET_KNOW);
  if (m) {
    const member = findMember(m[1], members);
    const message = m[2].trim().replace(/[.!?]+$/, '');
    if (member && message.split(/\s+/).length >= 1) return { kind: 'message', member, message };
  }
  return null;
}

// Demo phones are +1555…; DEMO_FAMILY_PHONE gives the primary caregiver a real number to ring.
export function dialableNumber(member) {
  const phone = member.primary && process.env.DEMO_FAMILY_PHONE ? process.env.DEMO_FAMILY_PHONE : member.phone;
  return phone && !phone.startsWith('+1555') ? phone : null;
}

// Runs the intent. Returns { reply, transfer? } or null when nothing matched.
export async function handleIntent(senior, checkin, text) {
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  const intent = detectIntent(text, members);
  if (!intent) return null;
  const first = intent.member.name.split(' ')[0];

  if (intent.kind === 'message') {
    // Her own words, read back to her first, then sent.
    await sms(intent.member, `${senior.preferredName} asked me to tell you: "${intent.message}"`);
    await audit.log('porchlight', 'voice.message', { seniorId: senior._id, targetId: intent.member._id, detail: intent.message });
    return { reply: `Okay, I've sent ${first} your message: "${intent.message}." Anything else?` };
  }

  const phone = checkin.channel === 'phone' ? dialableNumber(intent.member) : null;
  await audit.log('porchlight', 'voice.connect', { seniorId: senior._id, targetId: intent.member._id, detail: phone ? 'live transfer' : 'asked to call back' });
  if (phone) {
    // A heads-up text first, so a missed call still reaches them.
    await sms(intent.member, `${senior.preferredName} is calling you through Porchlight right now. If you miss it, please call her back.`);
    return { reply: `Of course. I'm connecting you to ${first} now. Please stay on the line.`, transfer: phone };
  }
  await sms(intent.member, `${senior.preferredName} asked to talk to you. Please give her a call when you can.`);
  return { reply: `I can't put you through right now, so I've texted ${first} to call you. Is there anything else?` };
}
