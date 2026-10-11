# Porchlight — plan and feature spec

**One-liner:** Porchlight is a daily AI check-in call for older adults living alone that brings in family, neighbors, and volunteers when something's off — so nobody lies on the floor for a day, gets scammed, or goes a week without a real conversation.

**Track:** 1B (YC RFS Fall 2026: AI for the Aging Population). Also aim for Bloomerang (nonprofit) and MongoDB prizes.

**Wedge:** senior-services nonprofits running telephone reassurance programs (volunteers who call seniors daily). Porchlight handles routine calls and hands the ones that need a human to a volunteer, with context.

## Pain points → features

| Pain point (evidence) | Feature |
|---|---|
| Seniors fall and lie on the floor for hours or days because nobody notices (e.g. 85-year-old in Haifa found after a day only because neighbors noticed he didn't answer) | **Escalation ladder.** Missed check-in → retry → family → neighbor → volunteer, each with a timer, shown live. "I need help" button jumps straight to the top. |
| Families teach parents to hang up on unknown callers; AI voice and gift-card scams target seniors | **Trusted caller + Scam Check.** Call opens with a family member's recorded hello. Porchlight never asks for money or codes. Senior can describe any call and get a plain verdict; family is told if it looks like a scam. |
| One sibling does everything, others don't respond (caregiver forums) | **Family circle.** Shared care tasks with claim buttons, a fair-share tally, and nudges that respect each member's time zone. |
| Losing driving = losing independence; no rides to doctor, groceries | **Rides and errands from conversation.** "I need a ride to the doctor Tuesday" on a call becomes a task the circle or a volunteer can claim. |
| Smartphones are too complicated; parents want a call-only mode | **Nothing to learn.** The senior just answers a phone call. Optional big-button screen: Talk, I'm okay, Call family, Is this a scam?, I need help. |
| 40% of US adults 45+ are lonely; lonely adults spend ~7.3 hours a day alone (AARP 2025). Tech rarely creates deep connection | **Bridge, don't replace.** After each call, family gets conversation starters from what she talked about, and her stories go into a family story feed. Local activities suggested, with a ride offered. |
| Missed medications and follow-ups | **Gentle med check** on the call, refills turned into tasks. Never gives medical advice. |
| Nonprofits are limited by volunteer hours | **Volunteer desk.** Every senior in the program on one screen, sorted by who needs a human today. |

## Safety rules (say these in the pitch)
- Never gives medical advice or diagnoses; flags "different from usual" only.
- Never asks for money, passwords, codes or account numbers. Says so out loud.
- Says it's an AI when asked, and at the start of every call.
- Anything it tells the family, it tells the senior first.

## Demo script (3 minutes)
1. (20s) The story: a man lay on his floor for a day; his neighbors' habit of checking on him saved him. Porchlight makes that habit reliable.
2. (50s) Live check-in on the big-button screen (or a real call): she mentions her garden, a ride she needs, and a strange call about gift cards.
3. (40s) Family circle updates live: summary, conversation starters, ride task, scam alert.
4. (30s) Missed check-in: the porch light dims and the escalation ladder walks through family → neighbor → volunteer.
5. (40s) Volunteer desk: one volunteer covers many seniors. Business model, nonprofit pilot.

## Timeline (build ends 8:00)
- 1:45–2:30 Everyone runs the app locally; get LLM key working; Mongo Atlas URI in .env
- 2:30–4:30 Each owner deepens their area (see TASKS.md)
- 4:30–5:30 Optional real phone calls via Twilio; polish
- 5:30–6:30 Talk to local nonprofits / business connections; get a quote or pilot interest
- 6:30–7:30 Rehearse, record backup video, Devpost
