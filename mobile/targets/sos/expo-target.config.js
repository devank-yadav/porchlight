// The SOS widget (home screen and lock screen) and an iOS 18 lock-screen / Control Center button.
// Tapping either opens porchlight://sos: a big SOS button that alerts and calls the family.
// Native code: needs a development build (npx expo run:ios or EAS), not Expo Go. See mobile/WIDGET.md.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'PorchlightSOS',
  displayName: 'Porchlight SOS',
  bundleIdentifier: '.sos',
  deploymentTarget: '17.0',
  colors: {
    $accent: '#D93F2B',
    $widgetBackground: '#D93F2B',
  },
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
};
