# Backend integration notes

Owner: Rishi (Codex). Branch: `care/contract-seed`. Contract: `TEAM_PLAN.md`.

## B1

`GET /api/state` adds `appointments`, `actions`, `notices`, and `digest` and preserves the existing response fields. The seed includes member permission flags, task metadata, medication status, and Peggy's cardiology appointment tomorrow at 2 PM in America/New_York.

Fresh demo data has `actions: []` and appointment `transport: 'unknown'`. The sample notice refers to the porch repair Mark already owns. There is no confirmed ride until the approval workflow runs. The digest currently exposes its agreed shape with an open-task count; B6 supplies the full viewer digest.

Existing MongoDB demo data needs an explicit demo reset to load the new seed. Reset replaces all demo data. No automatic database reset is added.

## Teammate checkpoints

- Voice A3–A7 and call-ending polish are merged into `origin/main` at `6bd4872`. Voice reads appointments and notices from the existing collections and exports `tellSenior(senior, text)`. B1 supplies its appointment context.
- `origin/app/contract-ui` at `db844ae` adds the contract UI (C2–C5, C7). Action and task-handoff buttons depend on B2–B5. The `viewer` query is accepted by the existing state route but filtering arrives with B8.
- Backend edits stay in `server/src/care/*` and `server/src/store.js`; voice and app files retain their respective owners.

## Check B1

Start a fresh demo server with an empty `.env`, then run:

```sh
curl --fail http://localhost:3001/api/state
node server/src/care/contract.smoke.js
```

The smoke check runs an in-app conversation, presses Peggy's OK button, and resets the demo. Use a disposable demo server. It checks the contract, permissions, Peggy's appointment date/time, task metadata, notice consistency, the merged voice interface, the OK button, and reset behavior.
