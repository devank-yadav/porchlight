# SOS widget

The older adult can put a Porchlight SOS widget on the home screen or lock screen. On iOS 18 they can also put an SOS button at the bottom of the lock screen or in Control Center.

Tapping any of these opens `porchlight://sos`, a full-screen SOS button. Tapping SOS sends the "I need help" alert: every family member gets a phone call and an urgent notification with the location. Call 911 is on the same screen. The widget never alerts anyone by itself, so a pocket tap can't send it.

- Widget code: `targets/sos/` (SwiftUI and WidgetKit, built by `@bacons/apple-targets`).
- SOS screen: `src/app/sos.js` → `src/app/senior/sos.js` → `SeniorScreen` page `sos`.

## In Expo Go (no widget)

Widgets are native code, so Expo Go can't show them. The SOS screen and its deep link work in Expo Go:

```
xcrun simctl openurl booted "exp://127.0.0.1:8081/--/sos"
```

## Development build (widget included)

Needs a Mac with Xcode 16+ and CocoaPods 1.16.2+.

```
cd mobile
npx expo prebuild -p ios --clean
npx expo run:ios                 # iOS Simulator, no Apple account needed
npx expo run:ios --device        # a real iPhone, needs signing (below)
```

Then long-press the home screen, tap Edit → Add Widget, and pick Porchlight SOS. On the lock screen, long-press it, tap Customize → Lock Screen, and add the widget. The iOS 18 control goes at the bottom of the lock screen or in Control Center.

## Signing a real iPhone

- Sign in to Xcode with an Apple ID (Xcode → Settings → Accounts). A free Apple ID works on your own iPhone, but the app expires after 7 days. TestFlight and the App Store need the paid Apple Developer Program.
- Put the team ID in `app.json` as `expo.ios.appleTeamId`.
- The bundle id `com.porchlight.app` may already be taken. If so, change `expo.ios.bundleIdentifier` (the widget becomes `<id>.sos`).
- On the iPhone, turn on Settings → Privacy & Security → Developer Mode.
