# Tella

**An iPhone app for daily check-ins with older adults who live alone, with family, neighbors and volunteers in the loop.**

Peggy just answers the phone or taps a big button. Tella chats with her about her day, notices if something's off, and tells the right people: a scam call, a fall, a ride she needs, a week of feeling low. If she doesn't answer, it widens the circle step by step until someone reaches her.

Built at c0mpiled (Penn State, Oct 11 2026) for YC's Request for Startups: *AI for the Aging Population*.

## Why
- 40% of US adults 45+ say they're lonely, and lonely adults spend about 7.3 hours a day alone (AARP, 2025).
- Seniors who fall at home can lie on the floor for hours or days because nobody notices.
- Families teach parents to hang up on unknown callers, because AI voice and gift-card scams target seniors.
- One sibling usually carries the caregiving while the others drift away.

## What it does
- **Peggy's screen:** five huge buttons (talk, I'm okay, call family, is this a scam, I need help), read-aloud replies, dictation instead of typing.
- **Check-in calls** that ask about sleep, food, pills, plans and needs (in the app, or a real phone call via Twilio).
- **Escalation ladder** for missed check-ins or the help button: call again → family → neighbor → volunteer.
- **Scam check:** describe any call or letter and get a plain verdict; family is told.
- **Family circle:** today's summary, conversation starters from what she shared, her stories, care tasks with a fair-share tally, activities with a ride offer.
- **Volunteer desk** for nonprofits: everyone in the program, sorted by who needs a human today.

## Run it
```bash
npm run setup
npm run dev          # starts the server and the Expo dev server
```
1. Install **Expo Go** from the App Store.
2. Scan the QR code in the terminal with your iPhone camera.
3. Pick a role: Peggy, a family member, or the volunteer. Use different phones for different roles to demo the live updates.

Phone and laptop need the same Wi-Fi. If that doesn't work (campus networks often block it), run `ngrok http 3001`, set `EXPO_PUBLIC_API_URL` in `mobile/.env`, and use `npm run app:tunnel`.

With empty `.env` files it runs in demo mode (rule-based AI, in-memory data, texts logged). Add keys in `.env` for a real AI model, MongoDB and Twilio.

## Stack
Expo (React Native, SDK 57), Node + Express, MongoDB, any OpenAI-compatible LLM, Twilio, expo-speech.

## Team
- TBD
