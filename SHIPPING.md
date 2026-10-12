# Shipping Porchlight

What changed to turn the hackathon demo into a product, and what's still open before an App Store release.
Kept up to date by whoever closes an item.

## Closed

### Accounts and sharing
- **Sign in by phone.** Enter a number, Porchlight calls it and reads a 6-digit code. Twilio Verify (call channel) when `TWILIO_VERIFY_SERVICE_SID` is set, otherwise a Twilio call reads a code we generate (stored hashed, 10 minutes, 5 tries). Without Twilio, development mode shows the code in the app; never with `NODE_ENV=production`.
- **Test sign-ins.** Fictional +1555 numbers with a fixed code and no call, for testers and App Store review. In development +1 555 000 0001 (older adult) and +1 555 000 0002 (family) work with 123456. In production only the numbers in `TEST_LOGINS` work, so set your own codes there. Porchlight never calls a test number, so the call buttons on a test account say so instead of ringing.
- **Rate limits** on code requests (per number and per IP, with a 30 s gap) and on checks, invites and joins.
- **Sessions**: a random token, stored hashed on the server and in the iOS keychain on the phone (expo-secure-store). 180-day sliding expiry. A 401 signs the app out.
- **One role per phone.** Chosen at sign-up (older adult or family) and tied to the number. There's no switch; signing out is the only way back.
- **Care circles.** Either side can start one:
  - The older adult signs up alone, then shares an invite code.
  - Family sets it up for a parent by phone number; when the parent signs in with that number, they're offered the circle.
  - Family joins with an invite code (6 characters, 7 days) or is offered the circle when someone added their number.
- **Who sees what.** The older adult and the primary contact manage the circle. Medicine details and transcripts are visible only to people with medicine access. Ride approval is per person.
- **Delete account** on both sides. An older adult's delete removes everything about them (calls, stories, medicines, rides, tasks, audit). A family member's delete removes them from the circle.

### Security
- Every `/api` route needs a session and only sees its own circle (403/404 otherwise). The acting family member always comes from the session, never from the request body.
- Twilio webhooks are checked against `X-Twilio-Signature`.
- Push tokens and account ids never leave the server.
- Generic 500s; no stack traces or internals in responses. Basic security headers.

### Product
- Removed the in-app chat (Talk). Talking happens on phone calls.
- Removed the "I'm okay today" button and its thanks screen. "Call me now" is the main button.
- "Is this a scam?" is a phone call: Porchlight asks what happened, gives a verdict and what to do, and tells the family if it sounds risky. The verdict also shows in the app.
- "Help with my phone" is a phone call too: Porchlight asks what the screen says and walks through it one step at a time, flagging fake warnings. The photo form, its camera and photo permissions, and expo-image-picker are gone.
- "I need help" is a safety alert: every family member gets an automated phone call that reads the alert out, plus an urgent push, at once; if no one taps "I'm on it" within 3 minutes they are called again, with where the phone is (map link and street, or "at home"), the time, the last call, any scam worry today, and today's pills (only for people allowed to see medicines). It stays pinned at the top of the family app until someone taps "I'm on it" (the ladder stops, the rest of the family and the older adult are told) and then "all okay". Location is asked for at setup, used only for this, and the alert goes out without it.
- SOS widget for the home screen and lock screen (plus an iOS 18 lock-screen / Control Center button). It opens a full-screen SOS button that sends the help alert. The widget needs a development build (mobile/WIDGET.md); the SOS screen works in Expo Go via porchlight://sos.
- Removed the "Call Anne" button and the per-person call buttons; "connect me to Anne" on a call still works.
- Removed every Sample label, sample note, simulated ride booking and the demo controls. Rides are always a real Uber hand-off the older adult confirms.
- Seeded people load only with `SEED_DEMO=1` (tests). A fresh server starts empty.
- Without MongoDB, data is saved to `server/data/porchlight.json`, so a restart no longer wipes it.
- The help and missed-call ladders call only people in that person's circle.
- Family phones get push alerts too (there's no Twilio texting number).
- The daily call starts on at 10 AM when the older adult signs up themselves; family-made profiles start with it off until someone picks a time.
- Weather, rides and times use each person's own home and time zone.
- App: iPad off until it has a layout.

## Open

### Needs Devank (accounts and hosting)
- [ ] **MongoDB Atlas Network Access** must allow the server's IP (or 0.0.0.0/0). Until then data lives in the JSON file on one machine.
- [ ] **A production server** with HTTPS (Render, Fly, Railway…). Set `PUBLIC_URL`, `NODE_ENV=production`, and the app's `EXPO_PUBLIC_API_URL` to it.
- [ ] **Twilio**: create a Verify service and set `TWILIO_VERIFY_SERVICE_SID` (best deliverability for codes). Buy a Twilio number for `TWILIO_FROM_NUMBER`; calls currently go out from a verified cell, and texts need a real number.
- [ ] **Apple**: developer account and team ID (`ios.appleTeamId`), EAS build (`eas build -p ios`), TestFlight. The app can't ship through Expo Go, and the SOS widget only exists in a real build.
- [ ] **App Store review account**: set `TEST_LOGINS` on the production server (e.g. `+15550000001=<code>,+15550000002=<code>`) and give Apple both numbers and codes in the review notes. Calls can't reach a test number, so add a short screen recording of a real scam-check call and an "I need help" call.
- [ ] **Privacy policy and terms** URLs (required by the App Store), and a support email. Link them from sign-in and Settings.

### Code
- [ ] Remove `NSAllowsArbitraryLoads` from `app.json` once the server is on HTTPS (needed only for a laptop on the LAN).
- [ ] Pronouns: many family-side strings and AI summaries assume "she/her". Ask for pronouns at setup, or rewrite to use the name.
- [ ] Rate limits live in memory; use Mongo or Redis if the server runs more than one instance.
- [ ] Call consent: the first call to a family-entered number should say who set it up and offer to stop.
- [ ] Change your phone number (today: delete the account and sign up again).
- [ ] Data export for a family on request.
- [ ] Error reporting (Sentry or similar) and uptime checks on the server.
- [ ] Accessibility pass with VoiceOver on a real phone for the new sign-in and setup screens.
