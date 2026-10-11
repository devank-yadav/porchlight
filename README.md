# Porchlight

**A daily check-in for older adults who live alone, with their family, neighbors and volunteers in the loop.**

Peggy just answers the phone (or taps a big button). Porchlight chats with her about her day, notices if something's off, and tells the right people: a scam call, a fall, a ride she needs, a week of feeling low. If she doesn't answer, it widens the circle step by step until someone reaches her.

Built at c0mpiled (Penn State, Oct 11 2026) for YC's Request for Startups: *AI for the Aging Population*.

## Why
- 40% of US adults 45+ say they're lonely, and lonely adults spend about 7.3 hours a day alone (AARP, 2025).
- Seniors who fall at home can lie on the floor for hours or days because nobody notices.
- Families teach parents to hang up on unknown callers, because AI voice and gift-card scams target seniors.
- One sibling usually carries the caregiving while the others drift away.

## What it does
- **Check-in calls** by voice (phone via Twilio, or the browser) that ask about sleep, food, pills, plans and needs.
- **Escalation ladder** for missed check-ins or the help button: call again → family → neighbor → volunteer.
- **Scam check**: describe any call or letter and get a plain verdict; family is told.
- **Family circle**: today's summary, conversation starters from what she shared, her stories, care tasks with a fair-share tally, and activities she'd enjoy with a ride offer.
- **Volunteer desk** for nonprofits: everyone in the program, sorted by who needs a human today.

## Run it
```bash
npm run setup
cp .env.example .env   # optional: add an AI key, MongoDB URI, Twilio
npm run dev            # http://localhost:5173
```
With an empty `.env` it runs in demo mode (rule-based AI, in-memory data, texts logged).

Views: `?view=senior`, `?view=family`, `?view=desk`. Demo controls (top right) simulate a missed check-in and reset data.

## Stack
React + Vite, Node + Express, MongoDB, any OpenAI-compatible LLM, Twilio, browser speech APIs.

## Team
- TBD
