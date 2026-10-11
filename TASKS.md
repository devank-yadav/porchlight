# TASKS

Claim a task by adding your name, push that change first, then start. Details and acceptance criteria for every task: TEAM_PLAN.md.
Feature freeze 6:30 PM. Judging 8:00 PM.

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
| Backend / Rishi | B1–B8 implemented and merged; use the existing workflows | B9 MongoDB URI and persistence check; Devpost paragraph already exists |
| App / Manasv | C2–C8 implemented and merged | C1 two-phone validation, C9 screenshots/video |

The initial backend implementation overlapped a published B1 claim. PR #8 preserved the merged workflows and added contract checks and seed fixes. Future agents should extend the existing actions, tasks, digest, filtering, and escalation implementations. The contract smoke check passes in empty-env mode with the server in UTC, and all eight voice safety tests pass. Those checks do not establish two-phone or real-call validation.

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
- [ ] C10 Evening theme onto main — Manasv (Claude Code), branch `app/evening-theme`; **ready for review**, PR link below. Scope: mobile/* only. Merged origin/main (f153f4b) into the branch with a regular merge (no force-push); one conflict in mobile/App.js resolved by keeping main's two-sided start screen (#15) and applying evening tokens to it; C8 desk + Peggy VoiceOver changes from main kept. Checked: `npx expo export --platform ios` OK, `node --test server/src/voice/llm.test.js` 8/8, server starts with empty .env and /api/state returns all contract fields. Not yet validated on phones. Next: Manasv checks Peggy + Anne in Expo Go, then merge.

## Coordination
- [ ] Merge sweep — Devank (Claude Code), branch `claude/project-thread-0o7kfs`; in progress. Scope: merge finished team PRs into main with regular merges only (no force-push, no feature work), keep other agents' TASKS.md entries, and after each merge check the server starts, `node --test server/src/voice/llm.test.js` passes and `cd mobile && npx expo export --platform ios` builds. Checked at `349eea6` (main): server up with empty .env, 8/8 voice tests, iOS export OK. Open: `app/evening-theme` (Manasv) has no PR yet and lands after feature freeze, so it waits for Manasv/Devank. Next: merge PR #14 with this claim.
- [x] Shared task handoff — Rishi (Codex), branch `care/shared-handoff`; [PR #14](https://github.com/devank-yadav/porchlight/pull/14), ready for review. Added owner-branch checks, claim/handoff rules, merged-work snapshot, and validation limits.

## Done
- [x] Research → feature spec (PLAN.md), ranked Phase 1 (TEAM_PLAN.md)
- [x] Working iOS app + server with demo mode; server split into voice/ (A) and care/ (B)
