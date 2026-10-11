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
- [ ] A8 Demo script, backup video, Devpost, ask organizers about 1B judging / Luminal (script in DEMO.md; rehearse, video, Devpost still to do)

## Person B — Backend & workflows (Codex) — name: Rishi
- [ ] B1 Contract seed + new fields in /api/state (by 2:45, push early) — claimed by Rishi (Codex), branch `care/contract-seed`
- [ ] B2 actions.js: state machine, idempotent approve, 403 for non-approvers, history, audit
- [ ] B3 Sandbox ride provider (clearly simulated), appointment transport, notice on confirm
- [ ] B4 outcomes.js: ride → action, other requests → tasks with quote + suggested owner, meds unsure → sensitive task
- [ ] B5 Task handoff/accept/decline + notice when claimed
- [ ] B6 Digest per viewer
- [ ] B7 Escalation: unresolved (amber) semantics + quiet hours
- [ ] B8 ?viewer= filtering
- [ ] B9 MongoDB Atlas + Devpost paragraph for the MongoDB prize

## Person C — iOS app (Claude Code) — name: Manasv
- [ ] C1 Two phones running in Expo Go
- [ ] C2 (Manasv, in progress) Peggy's notices card
- [ ] C3 (Manasv, in progress) Family Today: digest + approval card (approve only if canApprove)
- [ ] C4 (Manasv, in progress) Appointment card with transport chip
- [ ] C5 (Manasv, in progress) Tasks: quote, suggested owner, I'll do it / Ask / Accept / Decline / Done
- [ ] C6 (Manasv, in progress) Amber unresolved state, red only for help
- [ ] C7 (Manasv, in progress) Med status labels incl. Private
- [ ] C8 Desk restyle + VoiceOver labels on Peggy's screen
- [ ] C9 Screenshots + screen-recording backup

## Done
- [x] Research → feature spec (PLAN.md), ranked Phase 1 (TEAM_PLAN.md)
- [x] Working iOS app + server with demo mode; server split into voice/ (A) and care/ (B)
