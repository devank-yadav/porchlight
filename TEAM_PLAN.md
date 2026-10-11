# TEAM_PLAN.md — Phase 1 MVP, 3 people

Goal: by **6:30 PM feature freeze**, this works live, end to end, with fictional data:
**AI calls Peggy → she mentions a scam call, a ride she doesn't have, and milk she needs → Anne's phone shows it → Anne approves the ride, Mark claims the milk → Peggy hears only confirmed facts.**
Judging 8:00 PM. Everyone reads AGENTS.md first (rules for every coding agent).

## Setup (5 minutes, everyone)
1. Accept the GitHub invite to **github.com/devank-yadav/porchlight**, then `git clone` it.
2. `npm run setup` (also turns on the git hook that keeps AI tools out of the commit credits), then `npm run dev`.
3. Install **Expo Go** on your iPhone and scan the QR code.
4. Claude users: open the **"Porchlight – c0mpiled"** Claude project (it's linked to the repo), or run Claude Code in your clone. Codex user: run Codex CLI in your clone, or connect Codex cloud to the repo.
5. Put your name next to your role below and in TASKS.md, and push.

## Who does what

| | Person A — Voice & AI + demo lead | Person B — Backend & workflows | Person C — iOS app (UI) |
|---|---|---|---|
| Name | _fill in_ (suggested: Devank) | _fill in_ | _fill in_ |
| Tool | Claude Code | **Codex** | Claude Code |
| Owns (only they edit) | `server/src/voice/*`, PLAN.md, README.md, Devpost | `server/src/care/*`, `server/src/store.js` | `mobile/*` |
| Branch prefix | `voice/` | `care/` | `app/` |
| Ranked features led | 1 live call, 2 scam guard, 10 med "not sure" | 3 ride approval engine, 4 tasks engine, 7 digest, 8 escalation | 3/4 screens, 5 help, 6 Peggy screen, 7 digest UI, 9 desk |

Shared files (`server/src/index.js`, `env.js`, `wrap.js`, `.env.example`, `AGENTS.md`, `TEAM_PLAN.md`): change only after telling the team.

Why this split: each person owns one folder, so Claude Code and Codex never edit the same file. The contract below lets C build screens before B's backend is finished.

---

## The contract (agree at 2:30, then don't change without telling everyone)

B ships the **shapes and seed data first (by 2:45)**, even before the logic works, so C can build against real data.

### New and changed objects in `GET /api/state`

```js
// members: add permission flags (Phase 1 keeps permissions this simple)
{ _id: 'anne', ..., canApprove: true,  seesMeds: true }   // primary caregiver
{ _id: 'mark', ..., canApprove: false, seesMeds: false }  // sibling
{ _id: 'dolores', ..., canApprove: false, seesMeds: false } // neighbor

// appointments (new)
{ _id, seniorId, title: 'Cardiology follow-up', with: 'Dr. Lena Ortiz (sample)', where: 'Valley Heart Clinic (sample)',
  startsAt: ISO /* tomorrow 2:00 PM */, transport: 'unknown'|'self'|'at_risk'|'requested'|'confirmed', actionId: null }

// actions (new) — anything the AI wants to DO that needs a human OK
{ _id, seniorId, kind: 'ride', title: 'Ride to cardiology tomorrow',
  reason: 'Peggy said: "I don't have a ride."',            // her words
  details: { pickupAt: ISO, from: '12 Maple Ln (sample)', to: 'Valley Heart Clinic (sample)', needs: 'Uses a cane' },
  appointmentId, approverId: 'anne', simulated: true,
  status: 'PENDING_APPROVAL'|'APPROVED'|'REQUESTED'|'CONFIRMED'|'COMPLETED'|'REJECTED'|'FAILED'|'CANCELLED',
  history: [{ status, at, actor, evidence: { source: 'system'|'caregiver'|'sandbox', note, ref } }] }

// tasks: add fields (keep existing ones; `assignee` stays the owner field)
{ ..., quote: 'I'm out of milk', requestedBy: 'peggy'|memberId, suggestedOwner: memberId|null,
  handoff: { from, to, status: 'pending'|'accepted'|'declined' } | null, sensitive: false }

// checkins: add medStatus (keep medsTaken for now)
{ ..., medStatus: 'taken'|'not_taken'|'unsure'|'no_answer' }

// notices (new) — confirmed facts for Peggy's screen and next call
{ _id, seniorId, kind: 'ride'|'task', text: 'Your ride is confirmed: pickup tomorrow at 1:15 PM.', at, simulated: true }

// digest (new, computed per viewer)
digest: { line: 'Checked in 10:32 · Ride needs your OK · 2 tasks open',
          items: [{ tone: 'urgent'|'attention'|'ok', text, target: { type: 'action'|'task'|'escalation', id } }] }
```

`GET /api/state?viewer=mark`: if the viewer has `seesMeds: false`, the server hides `senior.meds`, sets `medStatus` to `'private'`, removes transcripts, and replaces sensitive task titles with "Private task (Anne can see it)". No viewer = everything (used by Peggy's screen and the desk). This is a demo identity switch, not real login.

### New endpoints (B builds; C calls)
| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/actions/:id/approve` | `{ memberId }` | 403 `{error}` if `canApprove` is false. Calling twice returns the same action and never double-books |
| POST | `/api/actions/:id/reject` | `{ memberId }` | REJECTED. Appointment stays `at_risk` |
| POST | `/api/actions/:id/complete` | `{ memberId }` | CONFIRMED → COMPLETED |
| POST | `/api/tasks/:id/handoff` | `{ from, to }` | `handoff.status = 'pending'` |
| POST | `/api/tasks/:id/accept` | `{ memberId }` | accepted, `assignee = memberId` |
| POST | `/api/tasks/:id/decline` | `{ memberId }` | declined, back to open |

### The A → B handoff (inside the server)
A's `analyze()` returns, and A's `finishCheckin()` passes to B's `handleCheckinOutcome(senior, checkin, analysis)`:
```js
{ summary, mood, medStatus,
  flags: [{ type: 'urgent'|'scam'|'lonely'|'change'|'meds_unsure', severity, text }],
  starters: [...], stories: [{ title, text }],
  requests: [{ type: 'ride'|'groceries'|'refill'|'visit'|'errand'|'repair', title, when, quote, blocker: true|false }] }
```
B → A: when a ride is CONFIRMED or a task is claimed, B inserts a notice and calls `tellSenior(senior, text)` from `voice/notify.js` (A implements: a short Twilio call or text if enabled, otherwise it's a no-op and the notice is enough).

---

## Person A — Voice & AI + demo lead (Claude Code)

| # | Task | Done when |
|---|---|---|
| A1 | **Model key** in `.env` (Luminal if Track 1B requires it; ask the organizers). Check that replies come from the model | `config.llm: true` in /api/state; replies vary |
| A2 | **Twilio trial + ngrok** → `PUBLIC_URL`; set `DEMO_SENIOR_PHONE` to a teammate's phone. Do the first real call | Teammate's phone rings, the conversation works, and the check-in appears in the app afterwards |
| A3 | **Scam policy rule** in `addTurn`: if the regex matches money/gift cards/codes, use a fixed safe reply *regardless of the model* (backend policy, not prompt) | Works with the LLM on and off; same on the phone path |
| A4 | **Ride detection**: the persona prompt includes upcoming appointments (read `appointments`); asks "Do you have a ride?" the day before; `requests[]` gets `blocker: true` + her `quote`. Replies never claim a booking ("I'll ask Anne and call you back once it's confirmed") | "I don't have a ride" → request with `type:'ride', blocker:true` |
| A5 | **Med "not sure"**: `medStatus` in analysis + `meds_unsure` flag. Reply wording: "That's okay, I'll let Anne know so she can check with you." Never suggests another dose | "I don't remember" → `medStatus:'unsure'` |
| A6 | **Quotes on every request** ("I'm out of milk") | Each request has a `quote` |
| A7 | **`tellSenior()`** + greeting mentions confirmed notices: "Good news: Mark is bringing your milk Thursday." | Next call opens with the confirmed notice |
| A8 | **Demo lead**: 90-second script, who stands where, backup video at 7:00, Devpost at 7:30, ask the organizers about 1B judging | Rehearsed twice |

Test fixtures A should keep in `server/src/voice/samples.md`: 10 short transcripts (scam, fall, lonely, ride, milk, meds unsure, normal day) and the expected analysis.

## Person B — Backend & workflows (Codex)

Only edit `server/src/care/*` and `server/src/store.js`. Add routes in `care/routes.js`. Test every task with curl against `http://localhost:3001`.

| # | Task | Done when |
|---|---|---|
| B1 | **Contract first (by 2:45)**: seed the appointment (tomorrow 2 PM), member flags, a sample notice, tasks with `quote`/`suggestedOwner`; add `appointments`, `actions`, `notices`, `digest` to `/api/state` (digest can be a stub). Push to main immediately | C can read every new field in the app |
| B2 | **`care/actions.js`**: `propose()` (dedupe: one open ride per appointment), `approve/reject/complete` with allowed transitions only, idempotent, 403 for non-approvers, `history` with evidence, audit log via `care/audit.js` | Approving twice = one booking; Mark gets 403 |
| B3 | **Sandbox ride provider**: after APPROVED → REQUESTED (+2s, evidence `sandbox`, "Request sent to sample ride service (simulated)") → CONFIRMED (+4s, ref `SBX-####`, "Simulated booking, not a real ride"). Appointment `transport` follows. On CONFIRMED: notice + `tellSenior` + text Anne | Status walks through on its own; labeled as simulated everywhere |
| B4 | **Outcomes** (`care/outcomes.js`): ride request with `blocker` + an upcoming appointment → propose a ride action and set appointment `at_risk` (not a plain task). Other requests → tasks with `quote`, `requestedBy:'peggy'`, `suggestedOwner` (errands/repairs → neighbor or the sibling with the fewest done tasks; refills/meds → primary). `medStatus:'unsure'` → sensitive task for Anne ("Check with Peggy about her blood pressure pill") | One call creates 1 action + 2 tasks |
| B5 | **Task handoff**: `/handoff`, `/accept`, `/decline`. When a task is claimed or accepted → notice for Peggy ("Mark is bringing your milk Thursday") + `tellSenior` | Notice only appears after someone actually claims it |
| B6 | **Digest** per viewer: urgent first (help, scam), then attention (action pending, missed check-in, meds unsure, unowned tasks), then ok | Line reads like "Checked in 10:32 · Ride needs your OK · 2 tasks open" |
| B7 | **Escalation polish**: missed = "unresolved", not an emergency; quiet hours (no texts 9 PM–8 AM in the member's time zone, show "held for quiet hours"); help ignores quiet hours | Ladder shows held steps at night |
| B8 | **`?viewer=` filtering** (meds, transcripts, sensitive tasks) | Mark's view has no medication details |
| B9 | **MongoDB Atlas**: `MONGODB_URI` in `.env`, data survives restart. One paragraph for Devpost on what's stored (actions with evidence history, audit log) for the MongoDB prize | Restart keeps data |

## Person C — iOS app (Claude Code)

Only edit `mobile/*`. Keep `theme.js` tokens and `ui.js` components (redesign them there, not per screen). Before pushing: `cd mobile && npx expo export --platform ios` must succeed.

| # | Task | Done when |
|---|---|---|
| C1 | Run the app in Expo Go on **two phones** (Peggy + Anne). Fix campus Wi-Fi with a hotspot or ngrok | Both phones update live |
| C2 | **Peggy's screen**: notices card at the top ("Your ride is confirmed…", "Mark is bringing milk Thursday") with a small "demo booking" label when `simulated` | Matches the contract |
| C3 | **Family Today**: digest line first; **approval card** for actions (her quote, ride details, status steps, evidence label "Simulated booking"); Approve/Reject only if `canApprove`, otherwise "Waiting for Anne to approve" | Anne approves; Mark can't |
| C4 | **Appointment card**: time, place, transport chip (needs a ride / requested / confirmed) | Chip follows the action |
| C5 | **Tasks**: "Peggy said: 'I'm out of milk'", suggested owner, buttons I'll do it / Ask [name] / Accept / Decline / Done, fair-share tally | Handoff works between two phones |
| C6 | **Amber** "check-in unresolved" (add an `amber` lamp state); red only for help | Missed check-in looks calm, help looks urgent |
| C7 | **Med label**: Taken (she said) / Not sure / Not yet / No answer / Private | Mark sees "Private" |
| C8 | Volunteer desk restyle; Peggy's 5 buttons at ≥20pt with VoiceOver labels | VoiceOver reads every button |
| C9 | Screenshots for Devpost + an iPhone screen recording as backup | In the Devpost draft |

---

## Timeline and checkpoints

| Time | Checkpoint | Who |
|---|---|---|
| 2:15 | Everyone cloned, running server + Expo Go; tasks claimed in TASKS.md | All |
| **2:45** | **Contract seed merged (B1)**. LLM key live (A1). App on two phones (C1) | All |
| 4:00 | **Ride rescue works in the app** without a phone call: Talk → "no ride" → Anne approves → confirmed → Peggy's notice | A4, B2–B4, C3–C4 |
| 5:15 | **Real phone call** end to end; tasks from the call with handoff; digest | A2, A7, B5–B6, C5 |
| 6:00 | Full demo dry run #1. List bugs only | All |
| **6:30** | **Feature freeze**. Bug fixes only | All |
| 7:00 | Dry run #2 + record backup video | A leads |
| 7:30 | Devpost submitted | A |
| 7:50 | At the table, two phones charged, laptop on hotspot | All |

Cut order if behind: B7 quiet hours → B8 viewer filtering → C8 desk restyle → A7 greeting notices. Never cut: live call (or the in-app fallback), scam guard, ride approval, tasks from the call.

## Kickoff prompts (paste as the first message)

**Person A in Claude Code:**
> Read AGENTS.md and TEAM_PLAN.md. I'm Person A (voice & AI). Only edit server/src/voice/*. Start with A3 (scam policy rule), then A4 and A5. After each task, run the server and show me a curl test that proves it.

**Person B in Codex:**
> Read AGENTS.md and TEAM_PLAN.md. You are Person B (backend & workflows). Only edit server/src/care/* and server/src/store.js. Do B1 first and keep it small so it can be merged by 2:45, then B2–B5 in order. Follow the contract in TEAM_PLAN.md exactly. For each task, add a curl test to server/test/smoke.sh and run it.

**Person C in Claude Code:**
> Read AGENTS.md, mobile/AGENTS.md and TEAM_PLAN.md. I'm Person C (iOS app). Only edit mobile/*. Use theme.js and ui.js. Start with C2–C4 using the contract fields (they'll exist after B1 merges). Run `npx expo export --platform ios` before every push.

## Demo (90 seconds, who does what)
- **A** (narrator): floor-fall story, then "watch Porchlight call Peggy".
- **B** plays Peggy on the phone: "Feeling okay. Not sure I took my pill. A man said my grandson's in jail and needs gift cards. And I don't have a ride to the heart doctor tomorrow. Oh, and I'm out of milk."
- **C** holds Anne's phone up: digest → Approve ride → status walks to Confirmed (simulated). Mark's phone claims the milk.
- Peggy's screen: "Your ride is confirmed. Mark is bringing your milk Thursday." Tap "I need help" → phones buzz.
- **A** closes on the volunteer desk: "One volunteer, fifty seniors. It doesn't just remind. It follows through."
