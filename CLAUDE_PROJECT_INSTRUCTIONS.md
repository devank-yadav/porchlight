# Claude project: "Porchlight – c0mpiled"

Created on claude.ai and linked to github.com/devank-yadav/porchlight (Settings → Environment → Project repositories).
The team brief is in the project's Goal field (Settings → General). If you recreate the project, paste the brief below into Goal and add the repo.

---

Win c0mpiled Track 1B (judging 8:00 PM Oct 11 2026, feature freeze 6:30 PM) with Porchlight. The repo is the source of truth; read AGENTS.md and TEAM_PLAN.md there first.

Porchlight: an AI calls an older adult living alone, notices problems (scam calls, a missing ride, errands, unsure about pills), and closes the loop with family approval. Family sees a short digest, approves actions (rides are a clearly labeled simulated booking), and claims tasks; the senior only hears confirmed facts. Wedge: nonprofits running telephone reassurance programs. Also targeting the Bloomerang and MongoDB prizes.

Team (tasks + data contract in TEAM_PLAN.md):
- Person A, voice & AI + demo lead (Claude Code): server/src/voice/*
- Person B, backend & workflows (Codex): server/src/care/*, server/src/store.js
- Person C, iOS app (Claude Code): mobile/* (Expo SDK 57, Expo Go)

Rules:
- Never add Claude as a co-author or contributor: no Co-Authored-By or "Generated with Claude" lines in commits or PRs.
- Respect folder ownership and the contract; never edit another person's folder without flagging it.
- The app must run with an empty .env; every external service needs a fallback.
- Never: medical advice, asking seniors for money/codes, hiding that Porchlight is an AI, or presenting a simulated booking as real.
- Keep answers short. Decisions go back into the repo (PLAN.md / TASKS.md).
