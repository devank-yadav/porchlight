# CLAUDE.md — Porchlight (c0mpiled hackathon, Track 1B)

Every teammate's Claude reads this first. Keep it current. Full spec: PLAN.md. Work queue: TASKS.md.

## What we're building
Porchlight: a daily AI check-in for older adults living alone. The senior just answers a phone call (or taps big buttons). Porchlight chats, notices problems, and brings in family, neighbors and volunteers when needed.
Wedge: senior-services nonprofits running telephone reassurance programs. Track 1B, YC RFS "AI for the Aging Population". Also aiming for Bloomerang (nonprofits) and MongoDB prizes.
Demo deadline: judging at 8:00 PM, Oct 11 2026. Feature freeze 6:30 PM.

## Run it
```
npm run setup      # once
cp .env.example .env
npm run dev        # API on :3001, web on :5173
```
Works with an empty .env (demo mode: rule-based AI, in-memory data, texts logged not sent).
Open http://localhost:5173/?view=senior | family | desk

## Layout
```
server/src/index.js       Express routes (API + Twilio webhooks)
server/src/llm.js         AI: conversation, post-call analysis, scam check (OpenAI-compatible + mock fallback)
server/src/escalation.js  Missed check-in / help ladder
server/src/notify.js      SMS + outbound calls via Twilio REST (logs when not configured)
server/src/store.js       MongoDB or in-memory, same API
server/src/seed.js        Fictional demo data (Peggy Hollis and her circle)
client/src/App.jsx        View switcher, polling /api/state every 2s
client/src/SeniorView.jsx Big-button screen, voice talk, scam check, help
client/src/FamilyView.jsx Family circle: today, alerts, tasks, stories, events
client/src/DeskView.jsx   Volunteer desk for the nonprofit
client/src/styles.css     All styles + design tokens
```

## Team and ownership (fill in names)
| Person | Owns | Branch prefix |
|---|---|---|
| TBD | AI quality: prompts in llm.js, real model hookup | `ai/` |
| TBD | Phone + SMS: Twilio calls, ngrok, real demo call | `phone/` |
| TBD | Family + senior UI, new features | `ui/` |
| TBD | Pitch, Devpost, nonprofit outreach, MongoDB Atlas | `pitch/` |
Edit only your area unless you've told the owner.

## Design rules (keep the look consistent)
- One bold element: the porch light (Lamp.jsx). lit = checked in, dim = waiting, alert = missed/help. Don't add other bright accents.
- Tokens live in `:root` in styles.css. Use them; don't add new colors.
- Fonts: Atkinson Hyperlegible (body, made for low vision) + Bricolage Grotesque (headings).
- Senior screen: huge type (≥1.3rem), buttons ≥112px tall, plain words, no jargon, no icons-only buttons.
- Copy: plain, warm, sentence case. Buttons say what happens ("Offer a ride", not "Submit").

## Product rules (never break these)
- Porchlight says it's an AI, and never asks for money, codes, passwords or ID numbers.
- No medical advice or diagnoses. Only "different from usual". Urgent → alert family + suggest 911.
- Anything told to the family is said to the senior first.
- All demo people and organizations are fictional and labelled "sample".

## Working rules for Claude
- Check TASKS.md; work on one task at a time. Small, commit-sized changes.
- The app must always run with an empty .env. Any new external service needs a fallback.
- Never commit secrets. Add new env vars to .env.example.
- After a change: say how to see it in the app. Run `npm run build` before pushing UI changes.
- Prefer working and simple over clever. Demo reliability beats features.

## Git
`git pull` before starting → branch `<prefix>/<task>` → small commits → PR → quick review → merge. `main` must always run. Demo from `main`.
