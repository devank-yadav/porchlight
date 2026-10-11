# CLAUDE.md — Porchlight (c0mpiled hackathon, Track 1B)

Every teammate's Claude reads this first. Keep it current. Full spec: PLAN.md. Work queue: TASKS.md.
Also read mobile/AGENTS.md before touching Expo APIs: Expo changes every SDK, don't trust memory.

## What we're building
Porchlight: an **iOS app** (Expo / React Native, SDK 57) plus a Node server. It's a daily AI check-in for older adults living alone. The senior answers a phone call or taps big buttons; Porchlight chats, notices problems, and brings in family, neighbors and volunteers when needed.
Wedge: senior-services nonprofits running telephone reassurance programs. Track 1B, YC RFS "AI for the Aging Population". Also aiming for Bloomerang (nonprofits) and MongoDB prizes.
Judging 8:00 PM, Oct 11 2026. Feature freeze 6:30 PM.

## Run it
```
npm run setup            # once
cp .env.example .env     # optional keys (server)
npm run dev              # server on :3001 + Expo dev server
```
On your iPhone: install **Expo Go** from the App Store, scan the QR code in the terminal with the Camera app.
The app finds the server on the laptop automatically (same Wi-Fi). If campus Wi-Fi blocks it:
`ngrok http 3001`, put the https URL in `mobile/.env` as EXPO_PUBLIC_API_URL, and run `npm run app:tunnel`.
Works with an empty .env (demo mode: rule-based AI, in-memory data, texts logged not sent).

## Layout
```
mobile/App.js               Fonts, role picker ("Who's using this phone?"), header, demo menu
mobile/src/SeniorScreen.js  Peggy: big buttons, talk (speech out + keyboard dictation in), scam check, help
mobile/src/FamilyScreen.js  Family: Today / Care / Stories / Circle tabs
mobile/src/DeskScreen.js    Volunteer desk for the nonprofit
mobile/src/Lamp.js          The porch light (status icon, animated)
mobile/src/ui.js            Shared components: Button, BigButton, Card, Segmented, text styles
mobile/src/theme.js         Design tokens (colors, fonts, radii)
mobile/src/api.js           Server calls + API base URL
mobile/src/useAppState.js   Polls /api/state every 2s
server/src/index.js         Express routes (API + Twilio webhooks)
server/src/llm.js           AI: conversation, post-call analysis, scam check (OpenAI-compatible + mock fallback)
server/src/escalation.js    Missed check-in / help ladder
server/src/notify.js        SMS + outbound calls via Twilio REST (logs when not configured)
server/src/store.js         MongoDB or in-memory, same API
server/src/seed.js          Fictional demo data (Peggy Hollis and her circle)
```

## Expo rules
- Install native packages with versions from `mobile/node_modules/expo/bundledNativeModules.json` (`npx expo install <pkg>` if it can reach the network).
- Only use modules that work in **Expo Go** (no custom native code), or the team can't run the app on their phones.
- Voice input = the iOS keyboard's dictation mic. Speech output = expo-speech. Real phone calls = Twilio on the server.

## Team and ownership (fill in names)
| Person | Owns | Branch prefix |
|---|---|---|
| TBD | AI quality: prompts in server/src/llm.js, real model hookup | `ai/` |
| TBD | Phone + SMS: Twilio calls, ngrok, real demo call | `phone/` |
| TBD | iOS app screens and new features | `app/` |
| TBD | Pitch, Devpost, nonprofit outreach, MongoDB Atlas | `pitch/` |
Edit only your area unless you've told the owner.

## Design rules (keep the look consistent)
- One bold element: the porch light (Lamp.js). lit = checked in, dim = waiting, alert = missed/help. Don't add other bright accents.
- Use tokens from theme.js and components from ui.js. Don't add new colors or one-off button styles.
- Fonts: Atkinson Hyperlegible (body, designed for low vision) + Bricolage Grotesque (headings).
- Senior screens: text ≥ 20pt, buttons ≥ 104pt tall, plain words, every button labelled for VoiceOver.
- Copy: plain, warm, sentence case. Buttons say what happens ("Offer a ride", not "Submit").

## Product rules (never break these)
- Porchlight says it's an AI, and never asks for money, codes, passwords or ID numbers.
- No medical advice or diagnoses. Only "different from usual". Urgent → alert family + suggest 911.
- Anything told to the family is said to the senior first.
- All demo people and organizations are fictional and labelled "sample".

## Working rules for Claude
- Check TASKS.md; one task at a time; small, commit-sized changes.
- The app must run with an empty .env. Any new external service needs a fallback.
- Never commit secrets. Add new env vars to .env.example (server) or mobile/.env.example (app, must start with EXPO_PUBLIC_).
- Before pushing app changes: `cd mobile && npx expo export --platform ios` must succeed.
- Prefer working and simple over clever. Demo reliability beats features.

## Git
`git pull` → branch `<prefix>/<task>` → small commits → PR → quick review → merge. `main` must always run. Demo from `main`.
