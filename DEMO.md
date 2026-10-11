# Demo script (90 seconds) — owner: Person A

All people and organizations are fictional samples. The ride is a **simulated booking** and we say so out loud.

**Who stands where:** A narrates and holds Peggy's phone (or takes the real call). C holds Anne's phone (Family app). B runs the laptop (server + backup).

| Time | Say / do | Screen |
|---|---|---|
| 0:00 | "Last year Peggy fell on her kitchen floor and lay there for a day before anyone knew. She lives alone, like millions of older Americans." | Title slide |
| 0:10 | "Porchlight calls her every morning. It says it's an AI, and it never asks for money or codes." Start the call (real phone, or Talk on Peggy's screen). | Peggy's phone |
| 0:20 | Peggy: *"A man called about gift cards for my grandson's bail."* → fixed scam reply. "That reply is a backend rule, not the model's mood." | Peggy's phone |
| 0:35 | Peggy: *"I don't have a ride to the heart doctor tomorrow."* → "I'll ask Anne and call you back once it's confirmed." It never claims a booking. | Peggy's phone |
| 0:45 | Peggy: *"And I'm out of milk."* then *"No, that's all."* The call ends itself. | |
| 0:50 | Anne's phone: digest line, the ride card with Peggy's own words. Anne taps **Approve**. Status walks: requested → confirmed, labelled "Simulated booking". | Anne's phone |
| 1:05 | Mark claims the milk. Peggy's screen: "Your ride is confirmed…" and "Mark is bringing your milk." | Both phones |
| 1:15 | "Peggy only hears confirmed facts. Nonprofits running reassurance calls get this for every senior on their list." | Desk view |
| 1:25 | **"It doesn't just remind. It follows through."** | |

## Exact lines for Peggy (match the rule-based fallback, so they work with an empty .env)
1. "I'm good. A man called about gift cards, I hung up"
2. "I don't have a ride to the heart doctor tomorrow"
3. "And I'm out of milk"
4. "No, that's all" (ends the call; the phone hangs up)

Expected replies and analysis: `server/src/voice/samples.md` ("Demo call" section).

## Backups
- No Wi-Fi to the laptop: phone hotspot, or `ngrok http 3001` + `npm run app:tunnel`.
- Twilio call fails: use **Talk** on Peggy's screen with the same three lines.
- Everything fails: screen recording on C's phone (record at 7:00).

## Before going on stage
- `node --test server/src/voice/llm.test.js` → all pass (safety replies, no false alarms, guard, demo-call analysis).
- Say the three lines once on Talk; check Anne's phone gets the ride and the milk.

## Test every feature on your iPhone (no keys needed)
1. On the laptop: `git pull`, `npm run setup` (first time), `npm run dev`.
2. iPhone (same Wi-Fi): open the Camera, scan the QR code in the terminal, it opens in **Expo Go**. (Expo runs with `--offline`, so nobody needs an Expo account; if Expo Go asks you to sign in, you started Expo some other way.)
3. Tap **Demo** (top right) → **Reset demo data**.
4. Pick **Peggy** → **Talk with Porchlight**, dictate or type the three lines, then tap **I'm done talking**. Or: **Demo → Play the demo call** to run it in one tap.
   - Scam line → the fixed scam reply. "No ride" → "I'll ask Anne… call you back once it's confirmed."
5. Tap the Porchlight name → switch to **Family · Anne**: digest line, scam alert, the **ride card** with Peggy's words → **Approve**. Watch it go Requested → Confirmed, labelled "Simulated booking". Appointment chip turns confirmed.
6. Switch to **Family · Mark**: the ride says "Waiting for Anne to approve" (he can't approve; the server returns 403). Meds show **Private**. Tap **I'll do it** on "Bring her milk".
7. Switch to **Peggy**: notices "Your ride is confirmed: pickup tomorrow at 1:15 PM." and "Mark is bringing your milk." Start Talk again: the greeting opens with that good news.
8. **Demo → Peggy presses Help**: red lamp, family ladder. **Demo → Simulate a missed check-in**: amber lamp (calm), not red.
9. **Volunteer desk**: all sample seniors with their status.
