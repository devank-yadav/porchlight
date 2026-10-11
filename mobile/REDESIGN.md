# Check the local redesign

The redesign is on `app/two-experiences`. The user authorized pushing this branch and creating a PR after reviewing the local design.

## Browser preview

The preview started for this task is at http://127.0.0.1:8087/ with a local sample API on port 3017. It uses mock AI and in-memory sample data; texts and calls are logged rather than sent.

- Older person: http://127.0.0.1:8087/senior/today
- Family: http://127.0.0.1:8087/family/anne/today

Choose Peggy to check Today, My plans and Family. Check in, open a chat, send an answer and finish it. Help opens a confirmation before an alert. Choose a family profile to check Today, Plans, Family/Stories and Settings. Anne and Mark have different privacy permissions.

## iPhone in Expo Go

Open two PowerShell terminals in `C:\Users\rishi\Documents\porchlight`.

Terminal 1:

```powershell
npm run server
```

Terminal 2:

```powershell
npm run app
```

Keep the computer and iPhone on the same Wi-Fi. Install Expo Go, scan the QR code printed by the second terminal with the iPhone Camera, and open the app. The ordinary app command uses the laptop host and API port 3001 automatically. The browser preview's 127.0.0.1:3017 override belongs only to that running preview process; it is not written into mobile/.env.

On the phone, check larger text, VoiceOver labels and focus, the keyboard/dictation chat flow, safe areas, and every bottom tab. Those native checks cannot be established by this Windows browser preview.

## Completed checks

- iOS export: `npx expo export --platform ios --max-workers 2`.
- Expo lint: `npx expo lint`.
- Configured TypeScript check: `npx tsc --noEmit` (JavaScript syntax/configuration, not full typed coverage).
- Browser interaction checks and 390 × 844, 320 × 740, 768 × 1024 captures.
- Impeccable verdict: all six finish-review fixes resolved at web-preview scope.

Screenshots and review evidence live in `../.impeccable/review/`. Product context and the design system live in `../PRODUCT.md` and `../DESIGN.md`.
