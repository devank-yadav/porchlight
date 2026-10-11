// OWNER: Person A (voice & AI).
// Things she can get done just by saying them, on a call or in the app:
//   "Can you connect me to Anne?"        → live transfer: Porchlight dials Anne and joins them.
//   "Tell Mark I loved the photos."      → the message goes to Mark as a text, and she hears it was sent.
import * as store from '../store.js';
import { sms } from './notify.js';

const CONNECT = /\b(connect|put|patch|transfer)\b.{0,15}\b(me\s+)?(through\s+)?(to|with)\b|\b(can|could|would|will) (you|i)\b.{0,20}\b(call|talk to|speak (to|with)|ring)\b|\bi('|’)?d like to (talk|speak) (to|with)\b|\b(call|ring) (my|anne|mark)\b/i;
const MESSAGE = /\b(?:tell|let|give)\s+(?:my\s+)?(\w+)(?:\s+know)?(?:\s+(?:that|a message))?[,:]?\s+(.{3,200})$/i;

// Who did she mean? A first name ("Anne") or a relation ("my daughter", "my son", "the neighbor").
function findMember(members, text) {
  const t = text.toLowerCase();
  const byName = members.find((m) => new RegExp(`\\b${m.name.split(' ')[0].toLowerCase()}\\b`).test(t));
  if (byName) return byName;
  return members.find((m) => {
    const rel = (m.relation || '').toLowerCase();
    return (/daughter/.test(t) && rel.includes('daughter')) || (/\bson\b/.test(t) && rel.includes('son'))
      || (/neighbo/.test(t) && rel.includes('neighbor'));
  }) || null;
}

const pronoun = (m) => (/daughter|mother|wife|sister/i.test(m.relation || '') ? 'she' : /\bson\b|father|husband|brother/i.test(m.relation || '') ? 'he' : 'they');

// Real number to dial for a family member. Demo members have fictional +1555 numbers,
// so the primary contact can be pointed at a real phone with DEMO_FAMILY_PHONE.
export function dialableNumber(member) {
  if (member.primary && process.env.DEMO_FAMILY_PHONE) return process.env.DEMO_FAMILY_PHONE;
  return member.phone && !member.phone.startsWith('+1555') ? member.phone : null;
}

// Returns { reply, action } when she asked for something we can do right now, else null.
export async function voiceAction(senior, checkin, text) {
  const members = senior.circleId ? await store.list('members', { circleId: senior.circleId }) : [];
  if (!members.length) return null;
  const onPhone = checkin.channel === 'phone';

  if (CONNECT.test(text)) {
    const who = findMember(members, text) || members.find((m) => m.primary);
    if (!who) return null;
    const first = who.name.split(' ')[0];
    const number = dialableNumber(who);
    if (onPhone && number) {
      return { reply: `Of course, ${senior.preferredName}. I'm connecting you to ${first} now. Stay on the line.`, action: { type: 'connect', to: number, name: first } };
    }
    await sms(who, `${senior.preferredName} asked to talk to you during her Porchlight check-in. Please give her a call when you can.`);
    return { reply: `I've asked ${first} to call you as soon as ${pronoun(who)} can. Is there anything else on your mind?`, action: { type: 'asked-to-call', name: first } };
  }

  const m = text.match(MESSAGE);
  if (m) {
    const who = findMember(members, m[1]) || (/(daughter|son|neighbo)/i.test(m[1]) ? findMember(members, text) : null);
    if (!who) return null;
    const first = who.name.split(' ')[0];
    const message = m[2].trim().replace(/[.!]+$/, '');
    await sms(who, `Message from ${senior.preferredName} (via her Porchlight check-in): "${message}"`);
    return { reply: `Done. I've sent ${first} your message: "${message}". Anything else you'd like me to pass along?`, action: { type: 'message', to: who._id, name: first } };
  }
  return null;
}
