# Calendar and ride actions — implementation and demo research

Planning only, researched October 11, 2026. Product decisions: [PLAN.md](../../../PLAN.md). Task/coordination notice: [TASKS.md](../../../TASKS.md), P1. Current contract: [TEAM_PLAN.md](../../../TEAM_PLAN.md). No OAuth connection, Uber credentials, API access, paid ride, or live location feed was exercised in this task.

## 1. Integration choice and access gate

**Proposed first calendar: Google Calendar.** Import only a calendar selected by the authorized parent or a caregiver who already has access to it. Start with read access and keep transport data in Tella. A dedicated shared care calendar limits what is imported and gives a straightforward two-phone demo. Calendar write-back is an optional later permission. Google supports OAuth scopes for events and calendar lists; request the smallest scopes needed, such as `calendar.events.readonly` plus `calendar.calendarlist.readonly` for a picker. [Google scopes](https://developers.google.com/workspace/calendar/api/auth).

**Proposed first ride adapter: Uber Health sandbox, contingent on account access.** It supports guest rides without a rider Uber account and is designed for organizations arranging and paying for transport. This fits phone-only users technically, but does not establish that a consumer startup can immediately sign up or bill each family's personal Uber wallet. Confirm eligibility, payer model, and enabled scopes with Uber before choosing it for production. [Health overview](https://developer.uber.com/docs/health/introduction), [business billing](https://help.uber.com/en/embedded-helpdot/business/article/managing-business-account-payment-methods?nodeId=97f435ae-f255-4ae0-95f0-451b6945887c).

**Alternative: Uber Riders API.** It uses rider OAuth for ride requests; Uber's current introduction says access requires approval. Older tutorials describing developer-only access are not a guarantee that a new account can use it today. Evaluate the user's payment/guest-rider permissions separately if this route is chosen. An Uber app deep link is a manual booking fallback and must be labelled "Finish booking in Uber"; it cannot prove autonomous booking or provide a provider-confirmed trip automatically. [Access policy](https://developer.uber.com/docs/riders/introduction), [ride-request authorization](https://developer.uber.com/docs/riders/ride-requests/tutorials/api/best-practices), [integration options](https://developer.uber.com/docs/riders/ride-requests/introduction).

**Access spike exit criteria:** obtain authorized sandbox credentials; successfully retrieve estimates and create/get/cancel one test trip; prove signed webhook reception; inspect actual products, tracking link, and location events. Record what worked. Public docs alone are not an integration. If access is unavailable, ship a documented local simulation and an optional manual handoff; do not promise a date for Uber approval.

## 2. Calendar import and appointment identity

Proposed files in B's area: `calendar/google.js`, `calendar/sync.js`, and care routes for connect/callback/disconnect/sync. These are suggestions, not files that exist today.

- Use server-side OAuth, validate state and account/circle binding, and encrypt refresh tokens. Secrets remain on the server and out of `/api/state`. A parent/calendar owner must authorize access; knowing their email is insufficient. Demo OAuth uses a team's sample calendar and explicit test users. Testing-mode Google refresh tokens for these scopes may expire after seven days. [Google OAuth](https://developers.google.com/identity/protocols/oauth2).
- Store the calendar connection ID, selected calendar ID, provider event ID, occurrence identity, source revision, start/end/time zone, and confirmed destination. Preserve repeated-event instances and distinguish local dates from UTC. Use one event occurrence per appointment, even across multiple syncs.
- Begin with a manual "Sync calendar" action for the demo, then add incremental sync. Persist sync tokens and paginate; on a 410 response rebuild only that connection's imported calendar mirror. Preserve rides and audit records. [Calendar synchronization](https://developers.google.com/workspace/calendar/api/guides/sync).
- Production can add `events.watch`: validate channel/resource identity and token, renew expiring watches, and fetch event changes after notifications. Periodic reconciliation is still needed; notifications are not a complete event payload and delivery can be missed. [Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push).
- Treat event text as untrusted input. It can supply an appointment candidate, never authority to change a budget, send data, or book a ride. Clarify missing address, ambiguous clinic, all-day event, duplicate appointment, cancelled event, and transport already arranged. A video appointment should not generate a ride.
- Before a job executes, re-read event revision, transport need, location, time, policy, and consent. An edit invalidates a stale proposed booking. A cancellation creates a cancellation/review workflow for an existing ride, with fees and provider result exposed; it never silently deletes ride history.

Native Apple Calendar can be a later adapter. It adds device permission and background-sync constraints; do not make always-on server automation depend on the iPhone app being open. Any Expo implementation must follow mobile/AGENTS.md and the installed SDK's documentation.

## 3. Selection and automatic authority

Extend the current `proposeRide()` and outcome handoff. The current code chooses the nearest upcoming appointment and uses fixed sample locations and pickup offsets; replace those assumptions with an unambiguous event/leg and verified travel details.

The model extracts the parent's intent and explains the choice. Ordinary server code validates data, evaluates constraints, and calls providers. The model does not invent product IDs, fares, availability, location, or completed actions.

Proposed policy data: mode (`ask_every_time` or `within_limits`), authorized payer, rider consent reference, allowed destinations/purposes/products, maximum trip spend, weekly budget, maximum wait, arrival buffer, accessibility requirements, sharing recipients, expiry/revocation, and version. Autonomy needs affirmative prior authorization; default to asking when no saved policy exists. Health organization payment authority and family approval are distinct records.

Selection algorithm:

1. Get current quotes for the confirmed pickup/drop-off and intended time. Normalize product IDs, price/currency, whether price is fixed or estimated, ETA, travel duration, availability, and supported rider needs. [Health estimates](https://developer.uber.com/docs/health/references/api/v1/health-trips-estimates-post).
2. Reject unavailable or incompatible products, unknown required accessibility, missing ETA when a deadline matters, and missing/unbounded price when enforcing a spending cap. Evaluate per-trip limits and remaining budget including pending commitments and known cancellation fees. Final provider charges may vary; explain that and reserve an agreed contingency instead of promising an absolute fare guarantee.
3. For an immediate ride, calculate `estimatedArrival = now + pickupWait + boardingBuffer + tripDuration`. Require arrival no later than `appointmentStart - arrivalBuffer`. Scheduled quotes need the scheduled pickup/drop-off semantics returned by that provider. Today’s immediate ETA is not tomorrow's predicted pickup.
4. Choose lowest estimated cost among feasible quotes for cost preference; choose earliest estimated arrival among feasible quotes for speed preference. Break ties deterministically. Persist the inputs, exclusions, quote timestamp, policy version, and a plain explanation.
5. Requote before dispatch and invalidate approval when material terms exceed its authority. If the appointment or location changed, recompute. Unknown availability or a deadline that no ride can meet becomes an exception, never a made-up booking.

Wait & Save is capability-gated: show it only if the selected API returns an eligible product. Initial comparison is within the connected provider. Adding other providers requires supported APIs, account access, and compatible terms. Time pressure never overrides mobility constraints or spending authorization; medical emergency detection diverts to the existing urgent-help path.

## 4. Ride provider interface and state

Proposed B-owned modules: `rides/provider.js`, `rides/local.js`, `rides/uber-health.js`, `rides/policy.js`, `rides/jobs.js`, and `rides/webhooks.js`. Reuse `actions.js`, `outcomes.js`, `audit.js`, `routes.js`, notices, and digest. Keep all HTTP routes in care/routes.js or mounted care routers; index.js remains shared wiring only.

Proposed adapter operations:

```text
getQuotes(tripIntent) -> normalized quote list and capability metadata
createTrip(authorizedIntent, selectedQuote, bookingAttempt) -> provider trip ID and state
getTrip(providerTripId) -> current state, available driver/car data, timestamps, tracking URL
cancelTrip(providerTripId, authorization) -> cancellation outcome and fee information
parseWebhook(rawBody, headers) -> verified event reference
```

These names are our internal design. Confirm payloads against the enabled Uber API/account during the access spike.

Uber Health uses application client credentials. Request the enabled sandbox or production scope, cache tokens until expiry, and keep client secrets encrypted/server-side. [Authentication](https://developer.uber.com/docs/health/guides/authentication).

Health exposes estimates, trip creation, retrieval, and cancellation. On trip creation, use returned product/fare IDs, explicit guest and location data, and scheduling only when applicable. Guest notification preferences can include provider calls and third-party trip-link messages; test what actually works in the sandbox. Keep medical appointment details out of driver notes. [API index](https://developer.uber.com/docs/health/introduction), [create trip](https://developer.uber.com/docs/health/references/api/v1/health-trips-post).

Keep authorization/action status separate from trip status; this avoids treating scheduled dispatch as a driver assignment. Draft additive contract (requires A/B/C review):

| Existing entity | Proposed addition | Why |
|---|---|---|
| appointments | calendar source/occurrence/revision, geocoded destination, needsRide, transportConsent | Match the right event and invalidate stale plans |
| preferences | consent and versioned ride policy, payer/provider account reference | Establish exactly what can happen automatically |
| actions | selected quote, policy decision/evidence, event revision, leg, booking-attempt ID, provider environment, trip ID/status, tracking URL and last update | Record why and what was actually booked |
| notices | event identity, recipient, delivery/acknowledgement state, provider environment | Avoid duplicate or misleading notifications |
| private integration storage | encrypted OAuth credentials, sync state, job/outbox records and leases | Durable work and no secrets in app state |

The existing store enumerates its collections, so new collections require an explicit store update and an agreed response projection. Do not rely on unrecognized collections working in memory mode.

Suggested trip states and truthful user labels:

| Provider response | App wording | Consequence |
|---|---|---|
| processing | Finding a driver | A request exists; no driver confirmed |
| scheduled | Ride scheduled; driver details pending | No guarantee a driver is assigned yet |
| accepted | Driver assigned | Show actual driver/car details if supplied |
| arriving | Driver arriving | Notify parent with pickup instructions |
| in_progress | Trip started | Share active trip with approved recipients |
| completed | Provider reports drop-off | Close transport leg; attendance is unverified |
| no_drivers_available / driver_canceled | Ride needs attention | Re-evaluate authorized alternatives or ask family |
| rider_canceled | Ride cancelled | Record who requested it and any provider fees |
| unknown / stale | Update unavailable | Reconcile; retain last-known timestamp |

The mapping above follows [Health trip status documentation](https://developer.uber.com/docs/health/references/api/v1/health-trips-trip_id-get). Preserve the raw provider status for debugging. Existing `CONFIRMED` must not conflate scheduled and assigned; keep a detailed trip state and evidence beside the coarse legacy status until all consumers are migrated.

## 5. Prevent duplicate bookings and misleading outcomes

The current read-then-update approval path and in-process simulator timers are not adequate for paid actions with retries or concurrent workers.

- Persist a booking intent before contacting the provider, with one active intent per parent/event occurrence/leg. Claim execution atomically using a version check/lease and a unique constraint. Memory mode implements the same behavior for local tests; paid mode requires durable storage and refuses to fall back to volatile data.
- Use a provider idempotency key only if that API explicitly supports it. The reviewed Health create-trip reference does not document one. If POST times out after a possible booking, mark the outcome unknown and reconcile through supported provider lookup/account records; if still ambiguous, request human resolution. Do not blindly issue another POST or promise exactly-once external effects.
- Persist timers/jobs and recover after restart. On reconnect, inspect known active trips before sending more requests. A stale job must re-check consent, policy and calendar revision.
- Authenticate family identities and enforce circle/role access server-side before enabling real rides. Existing `memberId`/`viewer` strings are demo identities, not authentication. Protect webhook/demo endpoints and prevent demo reset from operating on production data.
- Use separate local, Uber sandbox, and live modes. Default to local when no configuration exists. An Uber failure leaves the action failed/unknown; it must never silently turn into a local success. Production is explicitly enabled with separate credentials and data.

## 6. Webhooks, location, and notifications

Uber Health documents status, driver-location, message, and receipt events. Webhooks have an HMAC signature and can arrive repeatedly or out of order. Verify raw request bytes, acknowledge valid events quickly, persist for processing, and fetch the authoritative trip on status changes. [Uber webhooks](https://developer.uber.com/docs/health/guides/webhooks).

Express currently parses JSON globally in index.js. A shared wiring change is needed to retain the exact raw bytes for the webhook signature; do not sign reserialized JSON. Coordinate that change with A before implementing it.

Use delivery state and an outbox for parent/family notices. Existing `tellSenior()` can initiate a call but does not prove the parent heard it. Record requested, provider accepted, delivered/answered where verifiable, and failed separately. Tell Peggy what will be shared before the action; attempt her result update first, then notify the family promptly and honestly if her call is unanswered. Do not block a critical family alert waiting indefinitely for a parent to answer.

For stage notifications, the app card can update through the existing state poll. SMS/push or spoken callbacks require their configured provider, tested recipient, and real delivery evidence; label logged messages as logged. Do not duplicate provider texts and Tella texts for the same event.

Use a returned `rider_tracking_url` when available. A driver-location event is vehicle position, not independent parent GPS. Show a timestamp and stale state; provider-reported drop-off is not proof the person entered the clinic. Phone GPS would need a separate consented mobile capability, device permission, and native/background testing; it is deferred from the Expo Go demo. Restrict trip sharing to approved contacts and stop exposing new location after the trip/consent window ends. Revoking app access does not necessarily revoke a provider URL that was already copied, so disclose that limitation.

## 7. Uber demo runbook

Three modes must be visible: `Local simulation`, `Uber sandbox`, `Live ride`. Use the first two for judging. A local `SBX-*` reference from today's actions.js is not an Uber sandbox ID.

### Official sandbox procedure

Use an enabled `health.sandbox` token with `https://sandbox-api.uber.com`. If access is unauthorized, resolve Uber whitelisting first. Create `POST /v1/health/sandbox/run` in a supported city; allow setup time and obtain driver IDs via GET of that run. Runs last eight hours. Pass `x-uber-sandbox-runuuid` when estimating and creating the test trip. Choose an available product, create the trip, and drive the test through `ACCEPT`, `ARRIVED`, `BEGIN_TRIP`, and `DROPOFF` using `/v1/health/sandbox/driver-state`. Use `CANCEL` for the failure rehearsal. Reserve/Hourly simulation is limited; receipt webhooks are unavailable. [Official sandbox guide](https://developer.uber.com/docs/health/guides/sandbox).

### Our preparation and stage design

- Connect a dedicated sample Google Calendar beforehand. Use a fictional person and a named sample appointment at a valid test location. The onstage sync imports the event; OAuth setup is not part of the 90-second presentation. Manual event entry remains visibly labelled if Google is unavailable.
- Seed a policy with a sensible sample cap and saved addresses; tell the audience that the family authorized this policy during setup. Peggy explicitly says she needs the ride. Have an exception case with a smaller cap ready for questions.
- Choose an on-demand sandbox trip and a near-future appointment, so stage timing does not wait for a next-day dispatch. Keep the simulator controls accessible only to demo operators. Check the test driver is ready just before the demo.
- Show quote provenance. If Uber returns only one product, show the actual quote during integration mode. Present the two-quote cost-versus-time comparison as a separate labelled local test. Never inject a fake Wait & Save offer into a response attributed to Uber.
- After creating the trip, show the received provider ID/state and let webhooks or authenticated polling drive the app. The operator changes the sandbox driver state, not the app's state directly. Capture request/response evidence with tokens and personal details redacted.
- Use the trip link or actual location updates only if the sandbox supplies them and they were verified in rehearsal. Otherwise show the genuine status timeline. A mock moving map must remain explicitly labelled as an illustration, with no live-tracking claim.
- Notify only consenting teammate test numbers. Verify provider sandbox messaging behavior before configuring real numbers; do not assume "sandbox" implies every connected SMS/call service is silent. A deterministic local notification feed is the stage fallback.
- Record a backup of the same mode used in rehearsal. If credentials/network fail, select local mode before resetting and explain the switch. Do not convert an unknown live/sandbox attempt into a fake successful booking.

A live paid trip is unnecessary for judging. A later live pilot needs provider/account authorization, a real willing rider, confirmed pickup/destination, payer authority, and a separately agreed test; do not dispatch and cancel a real driver merely to animate the demo.

## 8. Owner work packages and acceptance gates

These are proposed follow-on tasks, not claimed implementation work. Dependencies are explicit so the team can take one small task at a time.

| Order | Owner and scope | Done when |
|---|---|---|
| R0 | B: access spike and contract proposal, A/C review | Calendar access, Uber account capabilities/payer model documented, additive contract agreed |
| R1 | B: local provider, policy evaluator, atomic action claims | Cost/time cases, above-cap approval, duplicate triggers, and missing data behave deterministically |
| R2 | B + C: calendar connect/import and appointment card | One selected sample event imports once; move/cancel and recurring occurrences reconcile |
| R3 | B: Uber sandbox adapter and durable jobs | Actual test trip create/get/cancel works; timeout does not double-book; restart recovers known trips |
| R4 | B + A: signed webhook, outbox, spoken/provider updates | Out-of-order/duplicate updates converge; failed delivery is visible; spoken labels match mode |
| R5 | C: comparison reason, policy settings, trip timeline/link | Two-phone demo communicates the full action; no real GPS claim from vehicle data |
| R6 | A: rehearsal, pitch, source/document reconciliation | Calendar -> need -> choice -> automatic booking -> family update -> trip end is clear in 90 seconds |
| Pilot gate | All owners: identity, billing, permissions, operations | Real accounts and paid-action safeguards verified with an authorized pilot |

A's [daily-call PR #24](https://github.com/devank-yadav/porchlight/pull/24) and B's [Atlas PR #25](https://github.com/devank-yadav/porchlight/pull/25) are merged as of main 4e21672; extend those features. The accepted app navigation, reminder/request scope and UI acceptance criteria are in [PLAN.md](../../../PLAN.md#the-app-experience), with unclaimed U1–U5 handoffs in TASKS.md; R5 remains the single ride UI work item. A owns voice/scheduling and demo copy; B owns care/store; C owns mobile. Shared index.js/env/contract changes need a published owner coordination note. Read mobile/AGENTS.md before touching native APIs and complete the required iOS export gate for app changes.

Proposed environment names for later implementation: `CALENDAR_PROVIDER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `INTEGRATION_ENCRYPTION_KEY`, `RIDE_PROVIDER`, `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `UBER_WEBHOOK_SIGNING_KEY`, and an explicit live-rides enable flag. Keep values on the server. Add the agreed names to `.env.example` in the implementing PR; no values or new runtime settings are introduced by this planning change.

### Acceptance matrix

| Scenario | Required result |
|---|---|
| Normal appointment, confirmed need, fresh quote under saved cap | One automatic booking with recorded policy/quote and matching parent/family notices |
| Cheaper option misses arrival buffer | Select an eligible on-time option and explain the rejection |
| Every option over budget or incompatible with mobility | No automatic booking; one actionable exception |
| Revoked consent, stale calendar, missing/ambiguous address | Pause and clarify before purchasing |
| Repeated sync, concurrent approvals, worker restart | One active intent/leg; reconcile existing attempt before any retry |
| Provider POST outcome unknown | Visible unknown state and reconciliation; no blind duplicate request |
| Invalid signature, duplicate or reversed webhook order | Reject invalid input; converge on fetched current provider state |
| Driver cancels or appointment moves | Preserve audit trail, expose fees, and replan only with valid authority |
| No tracking URL or stale location | Status-only display or explicit stale timestamp |
| Phone-only parent | Spoken/provider updates plus trip tracking, no claimed phone GPS |
| Provider or notification failure | Actual failure shown; no simulated success in real provider mode |
| Empty environment | Clearly labelled local sample flow works without external calls |

Run focused unit tests on policy/time/consent and concurrency/timeout handling, then the existing voice tests and contract smoke check against a disposable empty-env server. Do not run the reset-based smoke test against the shared Atlas demo or real data. Record sandbox tests separately from local tests. Production gates require durable storage; the existing in-memory fallback remains for demos only.
