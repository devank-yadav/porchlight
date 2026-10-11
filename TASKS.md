# TASKS

Put your name on a task before starting. Feature freeze 6:30 PM. Judging 8:00 PM.

## Now (1:45–2:30)
- [ ] (everyone) `npm run setup`, `npm run dev`, click through all three views
- [ ] (ai) Get a model key working in .env (Luminal if 1B requires it; check their docs for base URL + model names). Confirm Talk replies come from the model
- [ ] (pitch) Create MongoDB Atlas free cluster, put MONGODB_URI in the shared .env (send privately, never commit)
- [ ] (pitch) Ask organizers: how is 1B judged? Must we use Luminal models?

## Core (2:30–5:00)
- [ ] (ai) Tune the conversation prompt in llm.js: warmer, shorter, asks about meds/food/plans/needs naturally
- [ ] (ai) Make analysis reliable: test 10 sample transcripts (scam, fall, lonely, ride, normal) and fix misses
- [ ] (phone) Twilio trial account + number, ngrok → PUBLIC_URL. Get one real call to a teammate's phone working end to end
- [ ] (phone) SMS alerts to real teammate numbers (update phones in seed.js or via .env)
- [ ] (ui) "Story keeper": button to send one of Peggy's stories to the family as a card / share link
- [ ] (ui) Family-voice opener: record Anne's hello in the browser (MediaRecorder) and play it at the start of Talk
- [ ] (ui) Buddy calls: on the volunteer desk, suggest pairing two lonely seniors with shared interests for a weekly call
- [ ] (pitch) Talk to local business/nonprofit connections at the event about reassurance-call programs. Goal: one quote or "we'd pilot this"

## Polish (5:00–6:30)
- [ ] (ui) Mobile check of family view on a real phone (open http://<laptop-ip>:5173 on the same Wi-Fi)
- [ ] (pitch) 3-minute demo script with the story from PLAN.md; rehearse twice
- [ ] (pitch) Record a 2-minute backup demo video
- [ ] (all) Devpost: problem, evidence, what we built, sponsors used (MongoDB, Luminal if used), team

## Stretch
- [ ] Spanish / Hindi check-ins (prompt + speech lang)
- [ ] Weekly family digest email
- [ ] Pharmacy refill reminders from the meds list

## Done
- [x] Research: senior + caregiver pain points → feature spec (PLAN.md)
- [x] Working app: senior screen (voice talk, I'm okay, scam check, help), family circle, volunteer desk, escalation ladder, demo mode
