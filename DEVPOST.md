# Devpost draft — Tella (owner: Person A)

Paste into Devpost and edit. Everything in the demo is fictional sample data.

## Tagline
A daily AI check-in for older adults living alone. It doesn't just remind. It follows through.

## Inspiration
An older woman falls on her kitchen floor and nobody knows for a day. Telephone reassurance programs at senior-services nonprofits exist to prevent that, but volunteers can only make so many calls, and a call that finds a problem ("I don't have a ride to the cardiologist") usually ends with a sticky note.

## What it does
- **Calls her every morning** (real phone call via Twilio, or big buttons on her iPhone). Tella says it's an AI and never asks for money or codes.
- **Scam guard:** gift cards, bail money, "verification codes" get a fixed safe reply from a backend rule, not the model's mood, and the family gets a text.
- **Ride rescue with family approval:** "I don't have a ride to the heart doctor tomorrow" becomes a ride request with her own words. Anne approves on her phone; the booking is a **clearly labelled simulated booking** (sandbox ride service). Mark can't approve (403).
- **Family tasks from the call:** "I'm out of milk" becomes a task suggested to whoever has done the least. When Mark takes it, Peggy hears "Mark is bringing your milk." She only ever hears confirmed facts.
- **Help button and missed check-ins:** help texts the whole circle at once. A missed check-in is "unresolved" (amber, calm), climbs a ladder (family → neighbor → volunteer) and respects quiet hours.
- **Pills:** "I'm not sure if I took it" → "That's okay, I'll let Anne know" and a private task for Anne. Never a suggestion to take another dose. No medical advice.
- **Family digest:** one line ("Checked in 10:32 · Ride needs your OK · 2 tasks open"), meds hidden from family members who shouldn't see them.

## How we built it
- iOS app in Expo / React Native (SDK 57), runs in Expo Go: Peggy's 5-button screen (20pt+ text, VoiceOver labels, Atkinson Hyperlegible), family screens, volunteer desk.
- Node/Express server. Voice: any OpenAI-compatible model with a rule-based fallback so the demo works with no keys; a backend safety policy runs before the model and an output guard checks every reply (no booking claims, no asking for codes, no diagnoses). Twilio for calls and SMS.
- Actions are a state machine (PENDING_APPROVAL → APPROVED → REQUESTED → CONFIRMED) with an evidence trail on every step and an audit log.
- Built by a 3-person team with Claude Code and Codex working in parallel, one folder per person, against a written data contract.

## MongoDB
Tella stores everything in MongoDB Atlas when `MONGODB_URI` is set (falls back to memory if Atlas is unreachable, so the demo never dies):
- `actions` with a full `history` of who did what and the evidence for it (caregiver approval, sandbox confirmation ref), the record a nonprofit needs to trust an AI that takes actions.
- `audit`: every approval, claim, handoff and decline.
- `checkins` with transcripts, AI summaries, flags and requests; `tasks`, `notices`, `appointments`, `escalations`.

## For nonprofits (Bloomerang)
The wedge is senior-services nonprofits running telephone reassurance programs. Tella makes the daily call for every senior on the list, and the volunteer desk shows only the people who need a human today, with the reason.

## Challenges
Making an AI that takes actions safe for a vulnerable user: fixed backend policy for scams and emergencies, family approval before anything is booked, and only confirmed facts read back to her.

## What's next
Real ride partners (with consent and payment handled by family), pharmacy refill status, multilingual calls, and nonprofit CRM sync.
