// Porchlight SOS: a home-screen and lock-screen widget, plus an iOS 18 control for the lock screen
// and Control Center. Each one only opens the app at porchlight://sos; the alert is sent from there,
// with one more tap on SOS, so a pocket tap never alerts the family by itself.
import AppIntents
import SwiftUI
import WidgetKit

private let sosURL = URL(string: "porchlight://sos")!
private let sosRed = Color(red: 0.851, green: 0.247, blue: 0.169) // tokens.js accent.red

struct SOSEntry: TimelineEntry {
  let date: Date
}

struct SOSProvider: TimelineProvider {
  func placeholder(in context: Context) -> SOSEntry { SOSEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (SOSEntry) -> Void) { completion(SOSEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SOSEntry>) -> Void) {
    completion(Timeline(entries: [SOSEntry(date: .now)], policy: .never)) // nothing changes
  }
}

struct SOSWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: SOSEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Text("SOS").font(.system(size: 17, weight: .heavy, design: .rounded))
      }
      .widgetAccentable()
      .accessibilityLabel("Porchlight SOS")
    case .accessoryRectangular:
      HStack(spacing: 8) {
        Image(systemName: "sos.circle.fill").font(.title)
        VStack(alignment: .leading, spacing: 0) {
          Text("SOS").font(.headline)
          Text("Alert my family").font(.caption)
        }
      }
      .widgetAccentable()
      .accessibilityLabel("Porchlight SOS. Alert my family.")
    case .accessoryInline:
      Label("SOS: alert my family", systemImage: "sos")
    default:
      VStack(spacing: 10) {
        ZStack {
          Circle().fill(Color.white)
          Text("SOS")
            .font(.system(size: 30, weight: .heavy, design: .rounded))
            .foregroundStyle(sosRed)
        }
        .frame(width: 84, height: 84)
        Text("Tap for help")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(.white)
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Porchlight SOS. Tap for help.")
    }
  }
}

struct SOSWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PorchlightSOS", provider: SOSProvider()) { entry in
      SOSWidgetView(entry: entry)
        .containerBackground(for: .widget) { sosRed }
        .widgetURL(sosURL)
    }
    .configurationDisplayName("Porchlight SOS")
    .description("Opens SOS. Tap SOS to alert and call your family.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

// iOS 18: a button for the bottom of the lock screen or Control Center.
@available(iOS 18.0, *)
struct OpenSOSIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Porchlight SOS"
  static let description = IntentDescription("Opens the Porchlight SOS screen.")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(sosURL))
  }
}

@available(iOS 18.0, *)
struct SOSControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "PorchlightSOSControl") {
      ControlWidgetButton(action: OpenSOSIntent()) {
        Label("Porchlight SOS", systemImage: "sos")
      }
    }
    .displayName("Porchlight SOS")
    .description("Opens SOS. Tap SOS to alert and call your family.")
  }
}

@main
struct PorchlightWidgets: WidgetBundle {
  var body: some Widget {
    SOSWidget()
    if #available(iOS 18.0, *) {
      SOSControl()
    }
  }
}
