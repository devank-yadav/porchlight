# Backend integration notes

Owner: Rishi (Codex). Branch: `care/contract-seed`. Contract: `TEAM_PLAN.md`.

## Current integration

Voice, the contract UI, and an initial B1–B6/B8 backend implementation have merged into main (through `a18860e`). The teammate backend overlapped the published B1 claim. This branch preserves those workflows and adds contract checks plus seed corrections. Approval and handoff routes, the full digest, and viewer filtering remain from the merged implementation.

The appointment now uses tomorrow at 2 PM in Peggy's America/New_York time zone even if the server runs in UTC. Historical medication status reflects whether the sample conversation actually mentioned medication; Peggy's OK button uses `no_answer`. The refill seed is sensitive, and hidden history tasks carry the agreed metadata. A sample notice refers to Mark's already-assigned porch repair. Fresh demo data has no invented ride booking.

B7 quiet hours and B9 Atlas setup remain open in TASKS.md. Future work should start from the merged backend and avoid rebuilding B2–B6/B8.

Existing MongoDB demo data needs an explicit demo reset to load seed updates. Reset replaces all demo data; no automatic database reset is added.

## Check the contract

Start a fresh demo server with an empty `.env`, then run:

```sh
curl --fail http://localhost:3001/api/state
node server/src/care/contract.smoke.js
```

The smoke check runs an in-app conversation, presses Peggy's OK button, and resets the demo. Use a disposable demo server. It checks the contract, member permissions, Peggy's appointment date/time, task metadata, notice consistency, the merged voice interface, the OK button, and reset behavior.
