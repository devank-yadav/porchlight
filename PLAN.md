# Porchlight — product plan

## Product decision — October 11, 2026

Rishi requested a family-focused product that takes actions: connect a parent's calendar, identify a transport need, choose an appropriate ride, book within agreed limits, and keep the parent and family informed through the trip. This supersedes the original nonprofit-first positioning and the earlier feature-tour demo in this file. Nonprofits and volunteer desks remain a possible later distribution channel; they are not required for the primary consumer journey.

This is a planning update, not a claim that the integrations are implemented. The current runtime/data contract in TEAM_PLAN.md remains in force. Proposed fields, states, endpoints, and owner handoffs are in [the implementation note](server/src/care/ACTION_PLAN.md); A/B/C must agree on the contract update before implementation. The published TASKS.md P1 claim records this user-authorized PLAN.md edit and owner notice. This update does not reopen the October 11 feature freeze.

**One-liner:** Porchlight calls your parent, handles everyday arrangements within the rules you agree on, and keeps you informed when help is needed.

**First customer:** an adult child helping an independently living parent who cannot reliably arrange transportation or manage every appointment alone. The parent agrees to participate and can communicate over a regular phone. Family members pay for the service and approve its authority to spend on their behalf; the parent controls participation and sharing.

**First outcome:** Peggy gets to an appointment she otherwise had no ride to, with a traceable booking and trip updates for Anne.

**Track:** c0mpiled Track 1B, AI for the Aging Population. MongoDB supports action history, booking reconciliation, and durable jobs. A nonprofit prize is secondary to the consumer story.

## The problem and the 30-second pitch

Families repeatedly check whether a parent is okay, track appointments, arrange transport, and chase updates across phone calls and group messages. A reminder or summary still leaves someone responsible for the arrangement.

> Mom has a doctor's appointment tomorrow, but she no longer drives. Today, someone has to notice, find a ride, book it, and keep the family updated. Porchlight checks her calendar, asks whether she needs a ride, and books an appropriate option within the family's agreed budget. It tells Mom who's coming and lets her family follow the trip. One conversation becomes an arrangement people can rely on.

Describe this as automating routine caregiving work: check-ins, reminders, transport arrangements, and follow-up. Physical assistance and emergency response still require an appropriate person or service. A time-sensitive appointment uses the ride planner; a reported medical emergency uses the existing urgent-help policy and is never optimized as a cheap cab trip.

## The main journey

1. **Set up together.** Anne connects the selected calendar and provider/payment account. Peggy agrees to the calls and to sharing ride updates with named contacts. Save a confirmed home address, usual destinations, mobility/boarding needs, call preferences, and who handles exceptions.
2. **Agree on autonomy.** Example sample policy: book rides to confirmed appointments from home, at most $35 per ride and $120 per week, no shared rides, arrive 15 minutes before the appointment. Record payer authorization separately from Peggy's consent to ride and share location. Approval-per-ride remains an optional preference.
3. **Notice the need.** Import an upcoming event and ask, "Your appointment is tomorrow at two. Do you have a way to get there?" A calendar event by itself does not authorize a purchase. Peggy's answer, or an explicit standing transport preference for that event, establishes the need.
4. **Choose an appropriate option.** Compare the products the connected provider actually returns. Filter out options that do not meet accessibility, boarding, arrival, location, budget, and maximum-wait rules. Prefer the lowest estimated cost that arrives on time; use earliest estimated arrival when the agreed priority is speed. Explain the choice in plain language.
5. **Act.** Within the saved policy, book automatically and notify family after the provider accepts the request. Outside that policy, show Anne the price, arrival estimate, and reason for one approval. Refresh stale quotes and re-check the appointment and consent immediately before booking.
6. **Tell both people what happened.** Peggy hears the actual booking state, driver/car details when supplied, and pickup instructions. Anne sees the same state, cost basis, selection reason, and trip link. Never say a driver has accepted merely because a request was submitted.
7. **Follow through.** Reflect provider updates for driver assigned, arriving, trip started, and completed. Surface cancellations, no available cars, notification failures, and stale tracking. A completed trip means provider-reported drop-off, not verified attendance inside the clinic.
8. **Get home.** As the next extension, Peggy can call or tap "I'm ready to go home". Use the same eligibility and spending rules for the return leg; do not assume a doctor's appointment ends on time.

## Ride selection, illustrated

These are fictional local demo quotes, not current Uber prices or guaranteed product availability. All durations and the policy budget are sample values.

At 1:00 PM, Peggy must arrive by 1:45 PM for a 2:00 PM appointment:

| Sample option | Price | Pickup wait | Drive | Boarding buffer | Estimated arrival | Decision |
|---|---:|---:|---:|---:|---|---|
| Standard | $24 | 5 min | 20 min | 5 min | 1:30 PM | Eligible |
| Economy, longer wait | $18 | 15 min | 20 min | 5 min | 1:40 PM | Choose for cost preference |
| Premium | $39 | 3 min | 20 min | 5 min | 1:28 PM | Above sample $35 automatic limit |

If the same quotes are evaluated at 1:10 PM, the economy option arrives at 1:50 PM and is excluded; standard arrives at 1:40 PM and wins. A speed preference chooses the earliest eligible arrival, within the spending authority. If no option is suitable, ask the designated family member to handle the exception.

Do not promise "best across all ride services" with one integration. Say "best eligible option among the returned quotes." Display Wait & Save only when the connected API actually exposes that product for the trip. Mobility requirements are hard constraints; a cheap sedan is not a substitute for required accessible transport.

## The app experience

**Parent:** normal phone calls are the primary interface. Optional large-button screen: Talk, Today's plans, My ride, Call family, and Help. The ride view shows who is coming, when, the vehicle details, and a way to get assistance. Read important changes aloud with accurate delivery status. No card numbers, passwords, or verification codes are collected in the conversation.

**Family:** three primary areas: Today, Plans & rides, and Settings. Today shows the latest check-in and exceptions that need action. Plans & rides contains appointments, ownership, booking/trip status, and receipts. Settings holds call schedules, calendar connection, contacts, spending limits, and sharing permissions. An action card explains "Selected standard: economy would arrive after the appointment buffer."

A parent's refusal, pause, or revocation is respected. Location sharing is limited to named recipients and the agreed trip window. Phone-only users get provider trip tracking, not phone GPS. Stories and transcripts are not automatically published to everyone in the family.

## What exists and what needs building

Verified against origin/main at 4b4ece8 and open PRs on October 11, 2026:

| Capability | Evidence today | Planned work |
|---|---|---|
| Conversation -> ride need | Voice analysis and care/outcomes.js propose a ride against a seeded appointment | Resolve the intended calendar event, clarify ambiguity, and record transport consent |
| Approval/history/notices | Existing care/actions.js and family cards | Add policy-based automatic authorization and accurate provider states |
| Booking | Timer-driven local simulator, labelled simulated in parts of the UI | Provider adapter, estimates, persisted booking attempt, real/sandbox trip IDs |
| Calendar | Seeded appointments | Google Calendar import, change/cancellation handling, shared-calendar selection |
| Trip tracking | No external tracking integration | Provider trip status/link, vehicle location timestamp, family sharing |
| Scheduled daily calls | Open [PR #24](https://github.com/devank-yadav/porchlight/pull/24), owner A | Review and extend that work; do not create a second scheduler |
| Durable storage | Open [PR #25](https://github.com/devank-yadav/porchlight/pull/25) contains Atlas persistence work | Review/merge, then add durable action jobs and atomic booking claims |
| Identity | Demo role/member-ID switching | Authenticated accounts and circle-scoped authorization before real rides |

TEAM_PLAN.md, DEMO.md, README.md, DEVPOST.md, and AGENTS.md still describe the earlier demo in places. The implementation rollout must reconcile their product copy and contract with the respective owners; this planning change does not silently update those files or claim the old demo already follows this plan.

## Implementation order and demo gates

1. **Access check and contract.** Confirm Google OAuth test access and Uber sandbox eligibility. Decide how production rides are billed; the consumer payer model must fit the provider agreement. Agree on additive data fields with A/B/C. Existing API documentation does not prove that our account has access.
2. **Honest offline flow.** Reuse existing action UI and add local quote choice, automatic-policy path, exception approval, and explicit trip states. Every screen and spoken notice says "simulated" for local data. No keys still works.
3. **Calendar vertical slice.** Import one sample event from a selected Google Calendar, capture no-ride confirmation, and generate one action. Verify edits and cancellations do not create duplicates.
4. **Uber sandbox slice.** Request quotes and a test trip, process real sandbox responses, update both phones, and show a simulated trip progressing through provider states. Access failure is a visible limitation with a local provider fallback selected before the run.
5. **Production pilot.** Real identity, rider/payer authority, provider approval/billing, atomic booking/reconciliation, delivery monitoring, and authorized live-trip testing. A plan update or hackathon demo is not authorization to buy real rides.

## Demo in 60–90 seconds

Prepare two phones (Peggy and Anne), a sample calendar event, a saved sample spending policy, and the provider mode before presenting. Read [the implementation/demo runbook](server/src/care/ACTION_PLAN.md) for sandbox setup.

| Time | Show | What the judge learns |
|---|---|---|
| 0–15 s | Imported appointment; Peggy says she has no ride | A calendar and conversation identify a concrete need |
| 15–30 s | Available quotes and one plain selection reason | The system uses arrival deadline, cost, and needs to decide |
| 30–45 s | Automatic booking under the saved policy; actual sandbox response ID | The system takes an authorized action |
| 45–65 s | Peggy's spoken update and Anne's notification/trip card | Both people know what happened |
| 65–90 s | Advance the sandbox through pickup to completion | Provider updates drive the follow-through |

Say before booking: "This uses Uber's sandbox; no real car is dispatched." If running the local simulator, say: "This is our local ride simulation; Uber access is pending." Show the mode persistently and keep the original provider status available as evidence. Use a sample on-demand trip for the stage; live scheduled/Reserve behavior adds timing dependencies. Demonstrate the cost-versus-speed decision with local sample quotes if the sandbox returns only one available product. Never present fixture prices or a moving illustration as live Uber quotes or live location.

## Additional features, in priority order

| Rank | Feature | Consumer outcome | Next concrete scope |
|---|---|---|---|
| 1 | Return ride by voice | Peggy can get home after an appointment that runs late | "I'm ready to go home" -> fresh quote -> policy -> booking -> updates |
| 2 | Appointment changes trigger replanning | A moved/cancelled appointment does not leave an unwanted ride | Refresh details, check cancellation terms, obtain authority for fees, and report provider result |
| 3 | Pickup assistance and familiar instructions | Peggy knows which car to enter and how to reach help | Read driver/plate details, saved entrance instructions, named-family contact; use verified provider capabilities |
| 4 | Grocery essentials | "I'm out of milk" becomes an order or an accepted family errand | Start with a reviewable cart or existing task; cap spend and require substitution preferences; order only after a supported provider confirms |
| 5 | Prescription refill coordination | A refill request reaches the right person before supplies run out | Request/handoff to family or pharmacy with an acknowledgement; no dosing advice, prescription changes, or promised pharmacy booking |
| 6 | Family-requested calls and reminders | "Please remind Dad about Tuesday" is delivered and acknowledged | Schedule a parent-approved reminder and report answered/undelivered accurately |
| 7 | Scam review and trusted callback | Parent can ask about a suspicious request without acting on it | Preserve existing scam check and offer a callback to a saved family contact |

Build the full appointment-to-ride-to-arrival path before adding commerce providers. Delay a services marketplace, fair-share scores, automatic story publishing, and nonprofit operations screens in the primary consumer flow. Provider/API availability for groceries or pharmacies must be researched when those features are selected.

## Evidence and success criteria

For the demo, prove that the selected quote meets the appointment deadline, an over-budget quote needs approval, repeated triggers create one booking, a provider failure is shown honestly, and family and parent see consistent states. Use the acceptance matrix in the implementation note.

For a small opt-in family pilot, measure call acceptance, parent willingness to continue, requests actually fulfilled, unwanted bookings, duplicate charges, missed notifications, and time family members spend coordinating. A missed check-in is unresolved contact, not proof of an emergency. A completed call is self-reported status, not proof that all is well.

## Research basis

Official documentation checked October 11, 2026. API access and behavior have not been tested with this project's accounts.

- [Uber Riders API access policy](https://developer.uber.com/docs/riders/introduction): approval is required; old public examples are not evidence of unrestricted access.
- [Uber Health API](https://developer.uber.com/docs/health/introduction): guest transport, with estimates, booking, and trip updates.
- [Uber Health sandbox](https://developer.uber.com/docs/health/guides/sandbox): provider test trips; see the implementation note for limitations and steps.
- [Google Calendar API authorization](https://developers.google.com/workspace/calendar/api/auth): user-granted scopes for calendar access.
- [DailyCall](https://www.dailycall.care/), [CareCall](https://carecall.care/), and [Snug](https://www.snugsafe.com/) already offer calls/check-ins and alerts. Reliable arrangements and completed outcomes are our proposed focus, not a proven unique market capability.
