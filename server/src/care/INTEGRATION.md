# Backend integration notes

Owner: Rishi (Codex). Branch: `care/contract-seed`. Contract: `TEAM_PLAN.md`.

## Current integration

Voice, the contract UI, and an initial B1–B6/B8 backend implementation have merged into main (through `a18860e`). The teammate backend overlapped the published B1 claim. This branch preserves those workflows and adds contract checks plus seed corrections. Approval and handoff routes, the full digest, and viewer filtering remain from the merged implementation.

The appointment now uses tomorrow at 2 PM in Peggy's America/New_York time zone even if the server runs in UTC. Historical medication status reflects whether the sample conversation actually mentioned medication; Peggy's OK button uses `no_answer`. The refill seed is sensitive, and hidden history tasks carry the agreed metadata. A sample notice refers to Mark's already-assigned porch repair. Fresh demo data has no invented ride booking.

B7 quiet hours is merged. B9 Atlas setup is owned by Rishi on `care/atlas`; see TASKS.md for connection and persistence evidence. Future work should start from the merged backend and avoid rebuilding B2–B8.

Existing MongoDB demo data needs an explicit demo reset to load seed updates. Reset replaces all demo data; no automatic database reset is added.

## Check the contract

Start a fresh demo server with an empty `.env`, then run:

```sh
curl --fail http://localhost:3001/api/state
node server/src/care/contract.smoke.js
```

The smoke check runs an in-app conversation, presses Peggy's OK button, and resets the demo. Use a disposable demo server. It checks the contract, member permissions, Peggy's appointment date/time, task metadata, notice consistency, the merged voice interface, the OK button, and reset behavior.

## Connect Atlas (B9)

1. Create an Atlas database user with read/write access to `porchlight`, and add the server laptop public IP to the project IP access list. See [MongoDB connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
2. Use Connect → Drivers to obtain the connection string, replace the password placeholder, and URL-encode special characters in the password. Set `MONGODB_URI` in the repo-root `.env`, which is ignored by Git. Set `MONGODB_DB=porchlight` and `RESEED=0`. Do not share or commit the URI.
3. Run `node server/src/care/atlas-persistence.js`. One process inserts and updates a temporary sample audit record, exits, and a second process reads it through the app store. Cleanup deletes only the record matching its unique ID and probe kind. It never seeds/resets the database, creates care actions, or contacts Twilio. Missing credentials or memory fallback fail the command. Failed cleanup prints the record ID for manual removal.
4. Start the API using `node server/src/index.js` (or `npm run dev`). Check `curl --fail http://localhost:3001/api/state`: `config.mongo` must be `true`. Restart the API, then confirm an existing task/check-in keeps its ID and state. Record the probe output and API restart result in TASKS.md before marking B9 complete.

The store now closes failed connection attempts and exports `disconnect()` for short-lived commands. Empty configuration or a failed initial Atlas connection still uses memory; `/api/state` reports the active backend. Memory data disappears on restart. Startup preserves existing seniors unless `RESEED=1`; demo reset replaces the demo collections. Keep `RESEED=0` for persistence checks.

Atlas uses the existing collections: `seniors`, `members`, `checkins`, `tasks`, `escalations`, `events`, `scamChecks`, `appointments`, `actions`, `preferences`, `audit`, and `notices`. Actions include their evidence history. The MongoDB prize paragraph already exists in A-owned `DEVPOST.md`; live Atlas use still needs connection and persistence evidence.

### Verified locally

On `care/atlas`, the real Atlas probe passed (insert, update, read in a separate process, scoped cleanup). Two isolated API launches both returned `config.mongo: true` and identical seniors, 12 tasks, 3 check-ins, actions, appointments, and notices. Empty and malformed URI configurations both returned `config.mongo: false` with working sample data. Check processes were stopped after use. Credentials are local and ignored by Git. This verifies server persistence; it does not establish iPhone validation or PR merge status.
