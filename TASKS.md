# TASKS

Claim a task by adding your name, push that change first, then start. Details and acceptance criteria for every task: TEAM_PLAN.md.
Feature freeze 6:30 PM. Judging 8:00 PM.

## Person A — Voice & AI + demo lead (Claude Code) — name: ____
- [ ] A1 Model key live in .env
- [ ] A2 Twilio + ngrok, first real call to a teammate's phone
- [x] A3 Scam policy rule (backend, not prompt)
- [x] A4 Ride detection with appointment context, never claims a booking (voice side; prompt uses appointments once B1 seeds them)
- [x] A5 Med "not sure" status + safe wording
- [x] A6 Quotes on every request
- [x] A7 tellSenior() + greeting mentions confirmed notices
- [ ] A8 Demo script, backup video, Devpost, ask organizers about 1B judging / Luminal (script in DEMO.md, Devpost draft in DEVPOST.md; rehearse + video still to do)

## Person B — Backend & workflows (Codex) — name: Rishi (B1–B6, B8 initial implementation merged from the teammate branch; integration checks on `care/contract-seed`)
- [x] B1 Contract seed + new fields in /api/state (by 2:45, push early)
- [x] B2 actions.js: state machine, idempotent approve, 403 for non-approvers, history, audit
- [x] B3 Sandbox ride provider (clearly simulated), appointment transport, notice on confirm
- [x] B4 outcomes.js: ride → action, other requests → tasks with quote + suggested owner, meds unsure → sensitive task
- [x] B5 Task handoff/accept/decline + notice when claimed
- [x] B6 Digest per viewer
- [x] B7 Escalation: unresolved (amber) semantics + quiet hours
- [x] B8 ?viewer= filtering
- [ ] B9 MongoDB Atlas + Devpost paragraph for the MongoDB prize (code ready with fallback; needs MONGODB_URI; Devpost paragraph in DEVPOST.md)

## Person C — iOS app (Claude Code) — name: Manasv
- [ ] C1 Two phones running in Expo Go
- [x] C2 (Manasv) Peggy's notices card
- [x] C3 (Manasv) Family Today: digest + approval card (approve only if canApprove)
- [x] C4 (Manasv) Appointment card with transport chip
- [x] C5 (Manasv) Tasks: quote, suggested owner, I'll do it / Ask / Accept / Decline / Done
- [x] C6 (Manasv) Amber unresolved state, red only for help
- [x] C7 (Manasv) Med status labels incl. Private
- [x] C8 (Manasv) Desk restyle + VoiceOver labels on Peggy's screen
- [ ] C9 Screenshots + screen-recording backup

## Done
- [x] Research → feature spec (PLAN.md), ranked Phase 1 (TEAM_PLAN.md)
- [x] Working iOS app + server with demo mode; server split into voice/ (A) and care/ (B)
