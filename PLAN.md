# Porchlight — product plan

## Product decision — October 11, 2026

Rishi requested a family-focused product that takes actions: connect a parent's calendar, identify a transport need, choose an appropriate ride, book within agreed limits, and keep the parent and family informed through the trip. This supersedes the original nonprofit-first positioning and the earlier feature-tour demo in this file. Nonprofits and volunteer desks remain a possible later distribution channel; they are not required for the primary consumer journey.

This is a planning update, not a claim that the integrations are implemented. The current runtime/data contract in TEAM_PLAN.md remains in force. Proposed fields, states, endpoints, and owner handoffs are in [the implementation note](server/src/care/ACTION_PLAN.md); A/B/C must agree on the contract update before implementation. The published TASKS.md P1/P2 claims record these user-authorized PLAN.md edits and owner notices. Rishi also approved everyday plans, requests, reminders, and family connection alongside calls. This update does not reopen the October 11 feature freeze.

**One-liner:** Porchlight helps your parent manage the day, handles everyday arrangements within agreed limits, and keeps the family informed through simple buttons or a phone call.

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

**Product goal:** the parent opens Porchlight to see what is happening today; a family member opens it to see what has been handled and whether a decision is needed. Calls, text/dictation, and large buttons feed the same appointments and action history. A request made on a call must appear in the app without needing to be submitted again. Phone-only participation remains supported.

### Parent navigation

| Destination | Contents | Main actions |
|---|---|---|
| Today | Porch light/check-in state, next appointment with transport readiness, next reminder, and one family message | I'm okay today; view the next plan; Done / Remind me later / I need help |
| My plans | Upcoming appointments, active ride, and requests with accurate progress | Arrange a ride; Remind me; Ask my family; view or change a request |
| Family | Familiar faces, private messages and a simple reply entry point | Call Anne; read a message aloud; reply by text or keyboard dictation |

Keep Talk with Porchlight available throughout, and retain an easy-to-find Help action. Settings can sit behind a clearly labelled control rather than another main parent tab. Preserve the existing theme tokens, porch light, text at least 20pt, buttons at least 104pt tall, and VoiceOver labels. Only the current mobile owner implements these changes.

An appointment card should make the next step obvious. Fictional sample, after a provider has confirmed the relevant state:

> Doctor's appointment · 2:00 PM
> Your ride is booked for 1:15 PM.
> Anne has been notified.
> View my ride · Something changed

Show "Notification sent" or "Delivery not confirmed" when that is all the evidence supports. Before booking, show the actual pending state instead. Driver details, arrival estimates, cancellation controls and tracking appear as available. After provider-reported drop-off, offer "I'm ready to go home"; this requests a fresh return quote and policy check, not an assumed booking.

### Family navigation

| Destination | Contents |
|---|---|
| Today | Latest check-in, arrangements handled, and exceptions requiring a decision; keep routine successful updates quieter |
| Plans | Shared appointment agenda, rides, reminders, request status, selection reasons and receipts when available |
| Family | Contacts, messages and parent-approved stories; move the existing Stories content here |
| Settings | Connected calendar, call schedule, confirmed addresses, spending limits, payer authority, parent consent and sharing permissions |

Reuse existing appointment cards, action timelines, task handoffs and contacts. A new navigation layout is proposed work, not a replacement already present in mobile/. Avoid making the parent repeat setup or exposing provider/debug data in normal screens.

### Competitor-inspired features and our MVP scope

These are published competitor features checked October 11, 2026, not independently tested performance claims. Our proposed improvement is visible follow-through across a small set of supported actions; it is not a claim that no competitor can do this.

| Feature | Competitor reference | Porchlight scope |
|---|---|---|
| Today's plan | [Lotsa Helping Hands](https://kp.lotsahelpinghands.com/how-it-works/) provides a calendar for rides, meals, visits and task reminders | Combine appointments and arrangements; show "Ride arranged", "Leave at 1:15", or "Address needed" on the relevant event |
| Routines with follow-through | [ElliQ](https://elliq.com/pages/caregivers) offers medication/hydration reminders and wellness goals | Done / Remind me later / I need help; ask what prevents completion and create a supported request when authorized. Medication completion is self-reported; no dosing or treatment advice |
| Requests without a call | [CareCall](https://carecall.care/) supports two-way texting and passing requests to family | Start with Arrange a ride, Remind me, and Ask my family; each creates one visible request and progress history |
| Family connection | [ElliQ](https://elliq.com/pages/caregivers) supports family photos and communication | Start with one text message card, read-aloud and reply. Photo attachments are a later extension if time permits; no new video-call system for this MVP |
| Flexible check-ins | [Snug](https://www.snugsafe.com/) supports early check-in and vacation mode; [CareCall](https://carecall.care/) lets an okay tap skip that day's call | Keep I'm okay today, add Skip today's call and Pause until...; explain exactly which calls/reminders/alerts pause and when they resume |
| Editable preferences | [CareCall](https://carecall.care/) exposes remembered notes for removal; [Lotsa](https://kp.lotsahelpinghands.com/how-it-works/) supports selectively shared information | Parent-controlled About me: preferred name, usual destinations, pickup instructions, communication/sharing choices, and correction/deletion of remembered details |

Parent refusal and revocation remain effective. Skipping a routine call must not silently dismiss an existing help request, cancel an appointment reminder, or revoke a ride. Keep an independent explanation of each paused service. No card numbers, passwords, or verification codes are collected in the conversation. Location is shared only with named recipients for the agreed trip window; vehicle tracking is labelled separately from parent phone GPS. Tell the parent what will be shared before sharing with family.

### MVP build order and acceptance

1. **Today's plan.** One selected calendar event appears consistently for parent and family with an explicit next step; missing location or stale sync is visible.
2. **Complete ride journey.** Appointment -> eligible quote -> authorized booking -> pickup -> provider-reported arrival -> requested return ride. Preserve local/sandbox/live labels, failure states and the existing access gates.
3. **Reminder cards.** Done, Later and Need help persist across reopening; Done is labelled as self-reported. Later schedules one next reminder; Need help records an actionable request rather than marking the reminder completed.
4. **Request buttons and shared history.** Each supported button and the equivalent voice request reach the same workflow. Repeated taps/retries do not create duplicate requests or bookings. Ask my family shows requested, accepted or declined accurately.
5. **Family message card, if time remains.** One authorized family member sends a private text message; the parent can read/hear it and reply. Do not infer that a message was read from successful delivery.

Spending controls, consent and sharing settings required by the ride flow are prerequisites, not optional polish. Flexible check-ins and editable preferences are accepted follow-on scope after the core flow; neither justifies reopening the feature freeze. Only ship supported request types. Defer games, social feeds, continuous GPS, additional purchasing integrations, and a services marketplace.

For the judge, begin on Today with the appointment and its transport status, demonstrate one arrangement, then show both people's updated cards. The UI itself should explain the problem and outcome within 30 seconds. Keep the full 60–90 second sandbox demo below for evidence of follow-through.

## What exists and what needs building

Repository status refreshed against origin/main at 4e21672 on October 11, 2026; UI additions above remain planned:

| Capability | Evidence today | Planned work |
|---|---|---|
| Conversation -> ride need | Voice analysis and care/outcomes.js propose a ride against a seeded appointment | Resolve the intended calendar event, clarify ambiguity, and record transport consent |
| Approval/history/notices | Existing care/actions.js and family cards | Add policy-based automatic authorization and accurate provider states |
| Booking | Timer-driven local simulator, labelled simulated in parts of the UI | Provider adapter, estimates, persisted booking attempt, real/sandbox trip IDs |
| Calendar | Seeded appointments | Google Calendar import, change/cancellation handling, shared-calendar selection |
| Trip tracking | No external tracking integration | Provider trip status/link, vehicle location timestamp, family sharing |
| Scheduled daily calls | Merged [PR #24](https://github.com/devank-yadav/porchlight/pull/24), owner A | Extend the existing scheduler for agreed reminder/pause behavior; do not create a second scheduler |
| Durable storage | Merged [PR #25](https://github.com/devank-yadav/porchlight/pull/25) contains Atlas persistence work | Add durable action jobs and atomic booking claims; persistence alone does not provide these |
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
