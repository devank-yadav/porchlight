# Demo script (90 seconds) — owner: Person A

All people and organizations are fictional samples. The ride is a **simulated booking** and we say so out loud.

**Who stands where:** A narrates and holds Peggy's phone (or takes the real call). C holds Anne's phone (Family app). B runs the laptop (server + backup).

| Time | Say / do | Screen |
|---|---|---|
| 0:00 | "Last year Peggy fell on her kitchen floor and lay there for a day before anyone knew. She lives alone, like 16 million older Americans." | Title slide |
| 0:10 | "Porchlight calls her every morning. It says it's an AI, and it never asks for money or codes." Start the call (real phone, or Talk on Peggy's screen). | Peggy's phone |
| 0:20 | Peggy: *"A man called about gift cards for my grandson's bail."* → fixed scam reply. "That reply is a backend rule, not the model's mood." | Peggy's phone |
| 0:35 | Peggy: *"I don't have a ride to the heart doctor tomorrow."* → "I'll ask Anne and call you back once it's confirmed." It never claims a booking. | Peggy's phone |
| 0:45 | Peggy: *"And I'm out of milk."* Hang up. | |
| 0:50 | Anne's phone: digest line, the ride card with Peggy's own words. Anne taps **Approve**. Status walks: requested → confirmed, labelled "Simulated booking". | Anne's phone |
| 1:05 | Mark claims the milk. Peggy's screen: "Your ride is confirmed…" and "Mark is bringing your milk." | Both phones |
| 1:15 | "Peggy only hears confirmed facts. Nonprofits running reassurance calls get this for every senior on their list." | Desk view |
| 1:25 | **"It doesn't just remind. It follows through."** | |

## Exact lines for Peggy (match the rule-based fallback, so they work with an empty .env)
1. "I'm good. A man called about gift cards, I hung up"
2. "I don't have a ride to the heart doctor tomorrow"
3. "And I'm out of milk"

Expected replies and analysis: `server/src/voice/samples.md` ("Demo call" section).

## Backups
- No Wi-Fi to the laptop: phone hotspot, or `ngrok http 3001` + `npm run app:tunnel`.
- Twilio call fails: use **Talk** on Peggy's screen with the same three lines.
- Everything fails: screen recording on C's phone (record at 7:00).
