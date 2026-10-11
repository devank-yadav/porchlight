# AGENTS.md — Tella (c0mpiled hackathon, Track 1B)

Shared instructions for every coding agent on the team (Codex reads this file; Claude Code imports it via CLAUDE.md). Keep it current. Full spec: PLAN.md. Work queue: TASKS.md.
Also read mobile/AGENTS.md before touching Expo APIs: Expo changes every SDK, don't trust memory.

## What we're building
Tella: an **iOS app** (Expo / React Native, SDK 57) plus a Node server. It's a daily AI check-in for older adults living alone. The senior answers a phone call or taps big buttons; Tella chats, notices problems, and brings in family, neighbors and volunteers when needed.
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
mobile/App.js               Providers, floating header, toasts, sheet host
mobile/src/StartScreen.js   "Who is this phone for?" two doors + family picker
mobile/src/menus.js         Sheets: switch person, demo controls (long-press the name)
mobile/src/SeniorScreen.js  Peggy: big buttons, talk (speech out + keyboard dictation in), scam check, help
mobile/src/FamilyScreen.js  Family: Today / Care (daily call) / Stories / Circle tabs
mobile/src/DeskScreen.js    Volunteer desk for the nonprofit
mobile/src/Lamp.js          The porch light (status icon, animated)
mobile/src/design/          Design system: tokens.js, ui.js (T, Press, Button, BigButton, Card, Badge, Segmented),
                            Toaster.js (toast()), Sheet.js (sheet.open()), Icon.js (SF Symbols), theme.js, haptics.js
mobile/src/api.js           Server calls + API base URL
mobile/src/useAppState.js   Polls /api/state every 2s
mobile/src/calendar.js      Peggy's iPhone calendar (expo-calendar/legacy): her events → server, rides/reminders/call-backs → a "Tella" calendar
server/src/index.js          SHARED wiring only (mounts voice + care routes). Don't add routes here
server/src/store.js          MongoDB or in-memory, same API (owner: B)
server/src/wrap.js, env.js   SHARED helpers
server/src/voice/            OWNER: Person A
  llm.js                     AI: conversation, post-call analysis, scam check (OpenAI-compatible + mock fallback)
  checkins.js                start → turns → finish; hands the analysis to care/outcomes.js
  routes.js                  /api/checkins*, /api/scam-check, /api/seniors/:id/call, /twilio/*
  notify.js                  SMS + outbound calls via Twilio REST (logs when not configured)
server/src/care/             OWNER: Person B
  outcomes.js                handleCheckinOutcome(): analysis → tasks, actions, statuses, alerts
  escalation.js              Missed check-in / help ladder
  routes.js                  /api/state, senior buttons, tasks, demo reset (+ actions, handoffs)
  calendar.js                Phone calendar events → appointments (POST /api/seniors/:id/calendar)
  audit.js                   Audit log helper
  seed.js                    Fictional demo data (Peggy Hollis and her circle)
```
The data contract between A, B and C is in TEAM_PLAN.md. Follow it exactly.

## Expo rules
- Install native packages with versions from `mobile/node_modules/expo/bundledNativeModules.json` (`npx expo install <pkg>` if it can reach the network).
- Only use modules that work in **Expo Go** (no custom native code), or the team can't run the app on their phones.
- Voice input = the iOS keyboard's dictation mic. Speech output = expo-speech. Real phone calls = Twilio on the server.

## Team and ownership (fill in names) — full task list in TEAM_PLAN.md
| Person | Tool | Owns (only they edit) | Branch prefix |
|---|---|---|---|
| A — Voice & AI + demo lead: ____ | Claude Code | `server/src/voice/*`, PLAN.md, README.md | `voice/` |
| B — Backend & workflows: ____ | Codex | `server/src/care/*`, `server/src/store.js` | `care/` |
| C — iOS app (UI): ____ | Claude Code | `mobile/*` | `app/` |
Edit only your area unless you've told the owner. Shared files (index.js, env.js, wrap.js, .env.example, AGENTS.md, TEAM_PLAN.md) change only after telling the team.

## Design rules (keep the look consistent)
- Style: Emil Kowalski's design engineering (Sonner, Vaul, emilkowalski/skills). Quiet neutrals, hairline borders, soft depth.
- One bold element: the porch light (Lamp.js). lit = checked in, dim = waiting, amber = unresolved, alert = help. Red only for help and scams.
- Use tokens from design/tokens.js and components from design/ui.js. Don't add new colors or one-off button styles.
- Fonts: Atkinson Hyperlegible on Peggy's side (low vision); the system font (SF Pro) elsewhere. Icons: SF Symbols via design/Icon.js.
- Motion: Reanimated only. Press = scale 0.97 in 120ms. Ease-out curve (0.23, 1, 0.32, 1), under 300ms. Never animate tab switches.
  Feedback goes through toast(); short choices through sheet.open(). Respect Reduce Motion.
- Senior screens: text ≥ 20pt, buttons ≥ 104pt tall, plain words, every button labelled for VoiceOver.
- Copy: plain, warm, sentence case. Buttons say what happens ("Offer a ride", not "Submit").

## Product rules (never break these)
- Tella says it's an AI, and never asks for money, codes, passwords or ID numbers.
- No medical advice or diagnoses. Only "different from usual". Urgent → alert family + suggest 911.
- Anything told to the family is said to the senior first.
- All demo people and organizations are fictional and labelled "sample".

## Working rules for coding agents (Claude Code, Codex, any other)
- Check TASKS.md; one task at a time; small, commit-sized changes.
- The app must run with an empty .env. Any new external service needs a fallback.
- Never commit secrets. Add new env vars to .env.example (server) or mobile/.env.example (app, must start with EXPO_PUBLIC_).
- Before pushing app changes: `cd mobile && npx expo export --platform ios` must succeed.
- Prefer working and simple over clever. Demo reliability beats features.

## No AI co-authors (team rule)
- Never list Claude, Codex or any AI tool as a co-author or contributor: no `Co-Authored-By`, session links or "Generated with" lines in commits or PR descriptions. Commits are authored by the human teammate.
- Enforced by `.claude/settings.json` (`attribution` off) and the `.githooks/commit-msg` hook. `npm run setup` turns the hook on (`git config core.hooksPath .githooks`); run it once after cloning.

## Mixed team: Claude Code + Codex
- The repo is the single source of truth. Plans and decisions live in PLAN.md / TASKS.md, not in anyone's chat.
- Claim a task in TASKS.md (your name + tool) before starting, and push that change first so nobody duplicates it.
- One owner per file area (see ownership table). Two agents never edit the same file in parallel.
- Don't reformat, rename or "clean up" files outside your task; it causes merge conflicts across tools.
- Only the app owner runs installs in mobile/ (lockfile conflicts). Others ask them to add a package.
- Shared data shapes (actions, tasks, appointments) change only by agreement; note any change at the top of PLAN.md.

## Git
`git pull` → branch `<prefix>/<task>` → small commits → PR → quick review by a human → merge. `main` must always run. Demo from `main`.
