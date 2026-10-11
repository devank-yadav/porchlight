# Voice samples (Person A)

Generated from the rule-based fallback (empty .env) with one sample appointment tomorrow. With a model key the wording varies, but the policy replies (scam, fall, meds unsure, no ride) are fixed in `policyReply()` and never change. Re-run after changing llm.js.

## Scam call

- **Peggy:** A man said my grandson is in jail and I need to buy gift cards for his bail
- **Porchlight:** That sounds like a scam, Peggy. Real banks and government offices never ask for gift cards, money or codes over the phone. Please don't send anything or share any codes; I'll let Anne know. Did you give them any information?

Expected: medStatus `no_answer`, flags ["scam"], requests []

## Fall

- **Peggy:** I fell in the kitchen this morning and I can't get up
- **Porchlight:** Oh Peggy, I'm sorry. I'm letting Anne know right now. If you're hurt or can't get up, please press your help button or call 911. Are you safe where you are?

Expected: medStatus `no_answer`, flags ["urgent"], requests []

## Lonely

- **Peggy:** Nobody calls anymore, I'm a bit lonely
- **Porchlight:** I'm really glad you told me, Peggy. I'll let Anne know you'd love a call or a visit. What would make today a little nicer?

Expected: medStatus `no_answer`, flags ["lonely"], requests []

## No ride to cardiology

- **Peggy:** I don't have a ride to the heart doctor tomorrow
- **Porchlight:** Thank you for telling me. I'll ask Anne about a ride and call you back once it's confirmed. Is there anything else you need this week?

Expected: medStatus `no_answer`, flags [], requests [{"type":"ride","blocker":true,"quote":"I don't have a ride to the heart doctor tomorrow"}]

## Milk

- **Peggy:** I'm out of milk
- **Porchlight:** I'll pass that to your family, and I'll tell you who's helping once someone says yes. Is there anything else you need this week?

Expected: medStatus `no_answer`, flags [], requests [{"type":"groceries","blocker":false,"quote":"I'm out of milk"}]

## Meds unsure

- **Peggy:** I'm not sure if I took my blood pressure pill
- **Porchlight:** That's okay, Peggy. I'll let Anne know so she can check with you. Please don't take an extra one just in case. How are you feeling otherwise?

Expected: medStatus `unsure`, flags ["meds_unsure"], requests []

## Normal day

- **Peggy:** I slept fine
- **Porchlight:** Glad to hear it. Have you had something to eat today, and taken your blood pressure pill?
- **Peggy:** Yes I took my pill already
- **Porchlight:** Good. What are you up to today?
- **Peggy:** I'm working on my tomatoes in the garden
- **Porchlight:** That sounds lovely. Tell me more about that, I'd love to hear it.

Expected: medStatus `taken`, flags [], requests []

## Demo call (all three)

- **Peggy:** I'm good. A man called about gift cards, I hung up
- **Porchlight:** That sounds like a scam, Peggy. Real banks and government offices never ask for gift cards, money or codes over the phone. Please don't send anything or share any codes; I'll let Anne know. Did you give them any information?
- **Peggy:** I don't have a ride to the heart doctor tomorrow
- **Porchlight:** Thank you for telling me. I'll ask Anne about a ride and call you back once it's confirmed. Is there anything else you need this week?
- **Peggy:** And I'm out of milk
- **Porchlight:** I'll pass that to your family, and I'll tell you who's helping once someone says yes. Is there anything else you need this week?

Expected: medStatus `no_answer`, flags ["scam"], requests [{"type":"ride","blocker":true,"quote":"I don't have a ride to the heart doctor tomorrow"},{"type":"groceries","blocker":false,"quote":"And I'm out of milk"}]

