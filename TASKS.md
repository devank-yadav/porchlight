# TASKS

Claim a task by adding your name, push that change first, then start. Details and acceptance criteria for every task: TEAM_PLAN.md.
Feature freeze 6:30 PM. Judging 8:00 PM.

## Action product planning — October 11, 2026

- [x] P2 — Rishi (Codex), care/action-plan: documentation implemented; [PR #26](https://github.com/devank-yadav/porchlight/pull/26), review pending. Claim/owner notice pushed in 7591777 before edits. Scope: accepted parent/family navigation, six sourced competitor-inspired features, MVP build order, acceptance criteria and unclaimed handoffs. Main refreshed at 4e21672; #24/#25 are merged. Validation: documentation diff and local Markdown links; no runtime changes or phone validation. Next: owners review the plan and claim UI work below; New app UI thread retains mobile/ ownership.

- [x] P1 — Rishi (Codex), `care/action-plan`: documentation implemented in `ea83d62`; [PR #26](https://github.com/devank-yadav/porchlight/pull/26), review pending. User explicitly requested the PLAN.md update. Claim/owner notice was pushed in `005e590` before edits. Scope: PLAN.md and server/src/care/ACTION_PLAN.md describe the family customer, calendar-driven ride selection, booking within preauthorized limits, provider trip updates, Uber sandbox/local demo modes, and ranked follow-on features. Checked origin/main at `4b4ece8`, owner branch task queues, and open PRs #20/#21/#24/#25; no overlapping plan edit found. Official Uber and Google docs researched; no credentials, API access, provider call, paid booking, or phone GPS integration tested. Checked: Markdown links resolve and git diff --check passes; documentation-only change, so no runtime tests required. No runtime or existing TEAM_PLAN.md contract changes. Next: review the plan and claim R0 before implementation; this does not reopen the feature freeze.

Proposed implementation queue (unclaimed; acceptance gates and dependencies in [ACTION_PLAN.md](server/src/care/ACTION_PLAN.md)):

- [ ] R0 — B with A/C review: verify calendar/Uber access and payer model; agree the additive contract.
- [ ] R1 — B: local quote provider, automatic ride policy, and atomic booking-intent claims.
- [ ] R2 — B/C: selected calendar import and appointment edit/cancellation handling.
- [ ] R3 — B: Uber sandbox adapter, durable jobs, timeout reconciliation, and trip cancellation.
- [ ] R4 — B/A: signed webhooks, accurate parent/family notices, and delivery evidence.
- [ ] R5 — C: ride-choice explanation, policy controls, trip timeline and tracking link.
- [ ] R6 — A: two-phone rehearsal, 30-second pitch, and reconcile the earlier demo/product documents.

Daily-call PR #24 and Atlas PR #25 are merged as of main 4e21672; extend their existing work. R0–R6 are proposed after the user-requested product change, not assigned work or permission to dispatch real rides.

## App experience implementation queue

Accepted product scope; implementation unclaimed. Follow PLAN.md's MVP build order and the existing feature-freeze decision. These rows do not transfer mobile/ ownership from the New app UI thread. C coordinates with A/B before any shared contract changes; R0 still gates external integrations.

- [ ] U1 — C with B: Today / My plans / Family for parent; Today / Plans / Family / Settings for family. Reuse current cards and contacts; show one appointment and next action consistently on both views.
- [ ] U2 — C with B/A: reminder cards Done / Later / Need help with persistent state, self-reported completion, one rescheduled reminder and actionable help. Extend A's scheduler.
- [ ] U3 — C with B/A: Arrange a ride / Remind me / Ask my family buttons use the same workflows as voice. Verify duplicate prevention and truthful request/acceptance states.
- [ ] U4 — C with B, stretch: one private family text-message card with read-aloud and reply; defer photo uploads and new video infrastructure.
- [ ] U5 — C with A/B, follow-on: explicit call-skip/pause controls and parent-editable preferences; test automatic resumption and independence from existing help requests.

R5 already covers ride UI: expand that work item to include active-trip details, failure states, return-ride request and required consent/spending/sharing settings in the new navigation. Do not create a second ride implementation.

Acceptance is specified in PLAN.md. App implementation requires mobile/AGENTS.md, Expo Go compatibility, the iOS export gate and parent/family phone checks. Documentation completion does not imply these features are built.

## Shared context for every agent

This file is the shared work queue. Every teammate's agent updates its own claims, progress, blockers, and handoff here. `TEAM_PLAN.md` defines acceptance criteria and data shapes; `PLAN.md` defines product decisions. Backend details and validation commands are in `server/src/care/INTEGRATION.md`.

### Before starting or taking over work

1. Read the required agent instructions, then fetch `origin` and read the latest `origin/main:TASKS.md`.
2. Check open PRs and the relevant owner's remote branch, including that branch's `TASKS.md`. A claim pushed on a feature branch may not appear on main yet. An unchecked main row does not mean nobody has claimed it.
3. Claim one task with your human name, tool, branch, scope, and status; push the claim before implementation. Add the PR link when available.
4. Keep one owner per file area. A quiet branch or stale task row does not release another owner's claim; record an agreed handoff before taking over.
5. At each checkpoint, update the task with the commit/PR, validation evidence, remaining blocker, and next step. Distinguish implemented, ready for review, merged, and validated on phones. Preserve other agents' entries when resolving conflicts.

For example: `B9 — Rishi (Codex); care/atlas; in progress; PR #...; scope: persistence; checked: ...; blocker: ...; next: ...`.

### Latest verified handoff

Source: `origin/main` at `349eea6` (PR #8 merged). Refresh before acting on this snapshot.

| Area | Current repository state | Remaining work on the checklist |
|---|---|---|
| Voice / Person A | A3–A7 implemented and merged | A1 model key, A2 live call, A8 rehearsal/video/submission |
| Backend / Rishi | B1–B8 merged; B9 implemented and live Atlas persistence verified on `care/atlas` | B9 PR review/merge; Devpost paragraph already exists |
| App / Manasv | C2–C8 implemented and merged | C1 two-phone validation, C9 screenshots/video |

The initial backend implementation overlapped a published B1 claim. PR #8 preserved the merged workflows and added contract checks and seed fixes. Future agents should extend the existing actions, tasks, digest, filtering, and escalation implementations. The contract smoke check passes in empty-env mode with the server in UTC, and all eight voice safety tests pass. Those checks do not establish two-phone or real-call validation.

## Person A — Voice & AI + demo lead (Claude Code) — name: ____
- [x] A1 Model key live in .env (Claude Haiku 4.5 through Anthropic's OpenAI-compatible endpoint, on Devank's laptop)
- [x] A2 Twilio + ngrok, first real call: live streaming call (ConversationRelay) on Devank's upgraded Twilio account; heard every answer, ride request created for Anne's approval
- [x] A3 Scam policy rule (backend, not prompt)
- [x] A4 Ride detection with appointment context, never claims a booking (voice side; prompt uses appointments once B1 seeds them)
- [x] A5 Med "not sure" status + safe wording
- [x] A6 Quotes on every request
- [x] A7 tellSenior() + greeting mentions confirmed notices
- [x] A9 Uber as a phone notification (Devank, Claude Code, `claude/project-thread-lxigum`): server pushes "Your Uber to Target is ready" via Expo push (`voice/push.js`, `POST /api/seniors/:id/push-token`); tapping opens Uber pre-filled. Touches mobile/ (`src/notify.js`, one hook in App.js, expo-notifications) with Devank's OK. Needs `npx eas-cli init` in mobile/ once for remote push; otherwise the app notifies itself while open.
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
- [x] B9 — Rishi (Codex), `care/atlas`: implemented; [PR #25](https://github.com/devank-yadav/porchlight/pull/25): review/merge pending. Code commit `f0115dc`, current main integrated. Atlas credentials configured only in Git-ignored root `.env`. Checked: separate processes insert/update/read one temporary audit record and clean it up; `/api/state` reports `config.mongo: true`; API restart preserves seniors, 12 tasks, 3 check-ins, actions, appointments and notices; empty and invalid URI configurations still serve the demo in memory. Devpost paragraph already exists in A-owned `DEVPOST.md`. No shared API shape changes. Next: review and merge the code; other demo laptops need their own local Atlas configuration.

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

## Coordination
- [x] Voice A3–A7 + safety hardening, backend B1–B8, demo menu, two-sided start screen — Devank (Claude Code, Part A thread), branch `claude/project-thread-lxigum`; merged in PRs #1, #3–#7, #9, #10, #12, #13, #15. Backend and `mobile/` edits were done with Devank's OK at 6:36 PM while B/C were free. Checked: 8/8 voice tests, curl flow (demo call → ride action → Anne approves → simulated CONFIRMED → notices; Mark 403; viewer=mark hides meds), iOS export OK. Running on Devank's laptop (Expo Go); not yet validated on two phones.
- [x] Demo controls hidden from Peggy's side — Devank (Claude Code, Part A thread), branch `claude/project-thread-lxigum`; implemented, merged via the PR after #17. Scope: `mobile/App.js` only (handoff from Manasv's area agreed by Devank): no Demo button on Peggy's side; long-press the Porchlight name opens demo controls on any side. Checked: iOS export OK. Not yet validated on a phone.
- [ ] Merge sweep — Devank (Claude Code), branch `claude/project-thread-0o7kfs`; in progress, ongoing until judging. Scope: merge finished team PRs into main with regular merges only (no force-push, no feature work), keep other agents' TASKS.md entries, and after each merge check the server starts, `node --test server/src/voice/llm.test.js` passes and `cd mobile && npx expo export --platform ios` builds. Merged: PR #14 via [PR #16](https://github.com/devank-yadav/porchlight/pull/16). Checked at `f153f4b` (main): server up with empty .env, 8/8 voice tests, iOS export OK. Not validated on phones. Waiting: `app/evening-theme` (Manasv, 3 commits, merges cleanly) has no PR and came after feature freeze, so it needs Manasv or Devank to say go. Next: keep sweeping for new PRs.
- [x] Shared task handoff — Rishi (Codex), branch `care/shared-handoff`; [PR #14](https://github.com/devank-yadav/porchlight/pull/14), ready for review. Added owner-branch checks, claim/handoff rules, merged-work snapshot, and validation limits.

- [ ] New app UI (Emil Kowalski design system) — Devank (Claude Code, UI thread), branch `claude/project-thread-cwsvbd`; implemented, merging to main. Scope: `mobile/*` only plus the AGENTS.md layout/design notes. Every screen rebuilt on `mobile/src/design/` (tokens, Press, Button, BigButton, Card, Badge, Segmented with sliding pill, Sonner-style toasts, Vaul-style drag sheet that scales the app back, SF Symbols, Reanimated lamp). All features kept: two-door start, Peggy's 5 buttons/talk/scam/help, family Today (digest, ride approval with simulated label, flags, amber/red lamp ladder), Care (daily call schedule, Call now, tasks with handoff), Stories, Circle, desk, demo controls (••• or long-press the name). New mobile deps: react-native-reanimated 4.5.1, react-native-worklets 0.10.1, react-native-gesture-handler, expo-blur, expo-symbols: run `npm install --prefix mobile` after pulling. Checked: `npx expo export --platform ios` OK; clicked through start, family (demo call → approve ride → confirmed), Care, Circle, sheets, Peggy (talk, thanks, help), desk in a web build against the local server. Not yet validated on a phone in Expo Go.
- [x] Real phone calls: daily call schedule, Call now, natural voice, live streaming conversation, shorter phone greeting — Devank (Claude Code: laptop session on `voice/daily-call` plus the Part A thread on `claude/project-thread-lxigum`). Merged: PR #22 (LLM_HEADERS), #23 (no Timeout param), #24 (schedule, Call now, ConversationRelay/record modes, Chirp3-HD voice), #27 (short phone greeting). Checked: 9/9 voice tests, server starts with empty .env, iOS export OK, and real calls placed to Devank's test phone. Needs: an upgraded Twilio account plus the AI/ML addendum for VOICE_MODE=relay; MONGODB_URI still a placeholder. Note: the New app UI thread owns `mobile/` from now on.
- [x] Voice: "call me back later", "what do I have this week?", rides booked without approval + Uber link — Devank (Claude Code, Part A thread), branch `claude/project-thread-lxigum`; also merges the laptop's #34 reminders, #35 missed-call retry, #36 streaming replies, #38 ride wording. Rides: booked right away, family texted "Peggy is going…", primary caregiver's text has an Uber universal link (pickup/drop-off filled in; still a simulated booking in Porchlight). `senior.askBeforeRides` brings approval back. Checked: 16/16 voice tests, contract smoke passes, demo call → ride CONFIRMED with no approval, texts in New York time. Not yet tried on a live call.

## Done
- [x] Research → feature spec (PLAN.md), ranked Phase 1 (TEAM_PLAN.md)
- [x] Working iOS app + server with demo mode; server split into voice/ (A) and care/ (B)
