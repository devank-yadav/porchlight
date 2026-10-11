# TASKS

Put your name on a task before starting. Feature freeze 6:30 PM. Judging 8:00 PM.

## Now (2:00–2:45)
- [ ] (everyone) Install Expo Go on your iPhone. `npm run setup`, `npm run dev`, scan the QR, click through all roles
- [ ] (everyone) If the phone can't reach the server on campus Wi-Fi: ngrok + EXPO_PUBLIC_API_URL + `npm run app:tunnel` (see README). Or use a phone hotspot
- [ ] (ai) Get a model key working in .env (Luminal if 1B requires it; check their docs for base URL + model names). Confirm Talk replies come from the model
- [ ] (pitch) MongoDB Atlas free cluster → MONGODB_URI in the shared .env (send privately, never commit)
- [ ] (pitch) Ask organizers: how is 1B judged? Must we use Luminal models?

## Core (2:45–5:00)
- [ ] (ai) Tune the conversation prompt in llm.js: warmer, shorter, natural questions about meds/food/plans/needs
- [ ] (ai) Test 10 transcripts (scam, fall, lonely, ride, normal); fix analysis misses
- [ ] (phone) Twilio trial + number, ngrok → PUBLIC_URL. One real call to a teammate's phone, end to end. This is the demo's best moment
- [ ] (phone) Real SMS alerts to teammates' numbers (set phones in seed.js)
- [ ] (app) Family-voice opener: record Anne's hello with expo-audio and play it at the start of Talk (check it works in Expo Go first)
- [ ] (app) Local notification on the family phone when an alert appears (expo-notifications local only; check Expo Go support for SDK 57)
- [ ] (app) Story sharing: share button on a story using React Native's Share API
- [ ] (app) Buddy calls on the volunteer desk: suggest pairing two lonely seniors with shared interests
- [ ] (pitch) Talk to local business/nonprofit connections at the event about reassurance-call programs. Goal: one quote or "we'd pilot this"

## Polish (5:00–6:30)
- [ ] (app) VoiceOver pass on Peggy's screen (Settings → Accessibility → VoiceOver)
- [ ] (pitch) 3-minute demo script from PLAN.md, with two phones: Peggy and Anne. Rehearse twice
- [ ] (pitch) Record a 2-minute backup video (iPhone screen recording)
- [ ] (all) Devpost: problem, evidence, what we built, sponsors used, team

## Stretch
- [ ] TestFlight build via EAS (needs an Apple Developer account, $99/yr)
- [ ] Spanish / Hindi check-ins
- [ ] Weekly family digest

## Done
- [x] Research: senior + caregiver pain points → feature spec (PLAN.md)
- [x] iOS app (Expo): role picker, Peggy's screen with talk/scam/help, family Today/Care/Stories/Circle, volunteer desk
- [x] Server: AI conversation + analysis (with offline fallback), escalation ladder, scam check, tasks, Twilio hooks
