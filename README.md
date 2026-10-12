# Porchlight

**A daily phone companion that helps older adults live independently, and keeps their family in the loop.**

[Website](https://devank.me) · [Demo video](https://youtu.be/F7m_9-vjjbg) · [GitHub](https://github.com/devank-yadav/porchlight)

Built at c0mpiled (Penn State, Oct 11 2026), Track 1B, for YC's Request for Startups: *AI for the Aging Population*.

## Inspiration
Millions of older adults live alone. Their families worry, call when they can, and often find out about a scam, a missed pill or a fall days too late. Most "elder tech" asks seniors to learn a new app, or just sends alerts to family without helping the person at all. We wanted something that **helps her first and informs family second**, through the one device every senior already knows: the phone.

## What it does
Porchlight calls Peggy (our demo senior) every day on her regular phone. It talks to her in a warm, natural voice, and it actually helps:

- **Daily check-in.** It asks how she's feeling, listens, and never rushes or hangs up on her. It always asks before ending the call.
- **Scam protection.** If she mentions a suspicious call ("my grandson is in jail and needs gift cards"), it tells her clearly it's a scam, gives her safe next steps, and alerts her family.
- **Rides anywhere.** She can say "I need a ride to my heart doctor" or name any place. Porchlight finds it and sends her phone a notification that opens Uber pre-filled with the drop-off. Family are simply told she's going.
- **Medications.** Daily pill reminders on her phone with an "I took it" button. On the call, "yes, I took my pills" marks them taken. It never gives dosing advice.
- **Her week and the weather.** "What do I have this week?" reads from her real calendar, and it can answer weather questions.
- **Tech help.** It walks her through phone problems step by step and flags fake virus pop-ups.
- **Connect to family.** "Connect me to Anne" transfers the call live to her daughter's phone.
- **Stories.** Memories she shares are saved in her own words as a family keepsake, and family can send questions for her to answer.

**For family**, the app shows a calm daily summary (mood, pills, plans) and alerts only when something matters, like a scam call, a missed check-in or a missed dose, so they stay informed without micromanaging.

## Screenshots

### Peggy's side
| | |
|:---:|:---:|
| <img src="https://devank.me/screens/1.webp" width="240" alt="Peggy's home screen: a greeting, good news that Mark will fix her porch step, and a large Talk with Porchlight button"><br>*Her home screen* | <img src="https://devank.me/screens/2.webp" width="240" alt="Peggy's buttons: Call me now, I'm okay today, Call Anne, Is this a scam?, and a red I need help button"><br>*One tap for help, a call or a scam check* |

### Family side
| | | |
|:---:|:---:|:---:|
| <img src="https://devank.me/screens/3.webp" width="240" alt="Anne's Today tab: Peggy sounded happy, mood cheerful, pills taken, next call tomorrow at 10 AM"><br>*Today's summary* | <img src="https://devank.me/screens/4.webp" width="240" alt="Today's digest with upcoming appointments and their ride status"><br>*Her day and rides* | <img src="https://devank.me/screens/5.webp" width="240" alt="Things to talk about, and a week of moods: Thursday cheerful, Friday steady, Saturday cheerful"><br>*Her week at a glance* |
| <img src="https://devank.me/screens/6.webp" width="240" alt="Care tab: schedule Porchlight's daily call to Peggy at 10:00 AM, and her calendar synced from her iPhone"><br>*Daily call settings* | <img src="https://devank.me/screens/7.webp" width="240" alt="Peggy's synced calendar, including a cardiology follow-up, each with its ride status"><br>*Her synced calendar* | <img src="https://devank.me/screens/8.webp" width="240" alt="Stories tab: send Peggy a question, and her story Dancing at the Elks lodge, about meeting Walt in 1955"><br>*Stories in her own words* |
| <img src="https://devank.me/screens/9.webp" width="240" alt="Her story The tomato contest, with a suggested follow-up question about Walt's pie"><br>*Follow-up questions to ask her* | <img src="https://devank.me/screens/10.webp" width="240" alt="Circle tab: Anne (daughter), Mark (son) and Dolores (neighbor), and texts Porchlight sent them"><br>*Her circle* | <img src="https://devank.me/screens/11.webp" width="240" alt="Texts sent to family, including a heads-up that Peggy is taking an Uber to her nearest Target"><br>*Texts sent to family* |

## How we built it
- **Voice:** Twilio Programmable Voice with ConversationRelay for real-time, interruptible phone conversations, and natural ElevenLabs text-to-speech.
- **AI:** Claude Sonnet 4.6 runs the live conversation for fast, natural replies. Claude Sonnet 5.5 writes call summaries, family digests and stories. Tool calls handle rides, reminders, medications, calendar, weather and live transfer.
- **Backend:** Node.js server with MongoDB Atlas for care data (falling back to an in-memory store), Open-Meteo for weather, and geocoding plus Uber deep links for rides.
- **App:** React Native with Expo and Expo Router. There's a senior view and a family view, using expo-notifications for reminders and expo-calendar for real appointments.

## Challenges we ran into
- Making phone calls feel human: low latency, letting her interrupt, never cutting her off, and never freezing on a slow reply.
- Booking rides safely without an Uber business account, which we solved with pre-filled deep links she confirms herself.
- Balancing safety with dignity: helping her directly while only escalating to family when it matters.

## Accomplishments we're proud of
- Real, live phone calls end to end, including scam detection, live transfer to family and voice-driven rides to any destination.
- An AI that helps the senior, not just one that reports on her.

## What we learned
Latency and tone matter more than raw model power on a phone call. A faster model with a warm, concise voice beat a smarter but wordier one.

## What's next
SMS follow-ups through a dedicated number, a native build for richer notifications, more languages, and partnerships with senior living communities and caregivers.

## Run it
```bash
npm run setup
cp .env.example .env   # optional keys for the server
npm run dev            # starts the server on :3001 and the Expo dev server
```
1. Install **Expo Go** from the App Store.
2. Scan the QR code in the terminal with your iPhone camera.
3. Pick who the phone is for: Peggy or a family member. Use two phones to see live updates.

Phone and laptop need the same Wi-Fi. If that doesn't work (campus networks often block it), run `ngrok http 3001`, set `EXPO_PUBLIC_API_URL` in `mobile/.env`, and use `npm run app:tunnel`.

With an empty `.env` it runs in demo mode (rule-based AI, in-memory data, texts logged, not sent). Add keys in `.env` for an AI model (Claude or any OpenAI-compatible endpoint), MongoDB Atlas and Twilio. All people and organizations in the demo are fictional samples.
