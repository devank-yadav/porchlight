---
name: Porchlight
description: A legible daily page for older adults and the family around them.
colors:
  family-bg: "#F1F3F4"
  senior-bg: "#F7F7F5"
  surface: "#FFFFFF"
  family-sunken: "#F0F0EE"
  senior-sunken: "#EBEEE9"
  ink: "#252B2A"
  ink-secondary: "#454D4A"
  family-muted: "#626A67"
  senior-muted: "#59635C"
  faint: "#6B736F"
  family-line: "rgba(0,0,0,0.08)"
  family-line-strong: "rgba(0,0,0,0.14)"
  senior-line: "#DCE0DA"
  senior-line-strong: "#B7C0B9"
  lamp: "#F5A524"
  lamp-ink: "#241500"
  lamp-soft: "#FEF3DC"
  lamp-text: "#8A5300"
  red: "#D93F2B"
  red-soft: "#FDECEA"
  red-text: "#A8291A"
  green: "#2F8A4E"
  green-soft: "#E7F5EC"
  green-text: "#1F6B3B"
typography:
  display:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "40pt"
    fontWeight: 700
    lineHeight: "44pt"
    letterSpacing: "-1.2pt"
  title:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "22pt"
    fontWeight: 700
    lineHeight: "28pt"
    letterSpacing: "-0.5pt"
  headline:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "17pt"
    fontWeight: 600
    lineHeight: "22pt"
    letterSpacing: "-0.2pt"
  body:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "17pt"
    fontWeight: 400
    lineHeight: "24pt"
    letterSpacing: "-0.1pt"
  callout:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "15pt"
    fontWeight: 400
    lineHeight: "21pt"
  footnote:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "13pt"
    fontWeight: 400
    lineHeight: "18pt"
  label:
    fontFamily: "React Native system default (SF Pro on iOS)"
    fontSize: "13pt"
    fontWeight: 600
    lineHeight: "16pt"
    letterSpacing: "0.1pt"
  read-title:
    fontFamily: "AtkinsonHyperlegible_700Bold"
    fontSize: "38pt"
    fontWeight: 700
    lineHeight: "44pt"
    letterSpacing: "-0.6pt"
  read-headline:
    fontFamily: "AtkinsonHyperlegible_700Bold"
    fontSize: "26pt"
    fontWeight: 700
    lineHeight: "32pt"
    letterSpacing: "-0.2pt"
  read:
    fontFamily: "AtkinsonHyperlegible_400Regular"
    fontSize: "22pt"
    fontWeight: 400
    lineHeight: "31pt"
  read-small:
    fontFamily: "AtkinsonHyperlegible_400Regular"
    fontSize: "20pt"
    fontWeight: 400
    lineHeight: "27pt"
rounded:
  xs: "8pt"
  sm: "12pt"
  md: "16pt"
  lg: "16pt"
  xl: "20pt"
  pill: "999pt"
spacing:
  xs: "4pt"
  sm: "8pt"
  md: "12pt"
  lg: "16pt"
  xl: "24pt"
  xxl: "32pt"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "12pt 18pt"
    height: "48pt"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12pt 18pt"
    height: "48pt"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12pt 18pt"
    height: "48pt"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "12pt 18pt"
    height: "48pt"
  button-lamp:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.lamp-ink}"
    rounded: "{rounded.sm}"
    padding: "12pt 18pt"
    height: "48pt"
  senior-checkin:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.read-headline}"
    rounded: "{rounded.md}"
    padding: "20pt"
    height: "104pt"
  senior-action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.read-headline}"
    rounded: "{rounded.md}"
    padding: "20pt"
    height: "104pt"
  senior-help:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red-text}"
    typography: "{typography.read-headline}"
    rounded: "{rounded.md}"
    padding: "20pt"
    height: "104pt"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "18pt"
  badge-neutral:
    backgroundColor: "{colors.family-sunken}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "4pt 9pt"
  senior-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.read}"
    rounded: "{rounded.lg}"
    padding: "0pt 18pt"
    height: "60pt"
  bottom-tabs:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    height: "76pt"
  segmented:
    backgroundColor: "{colors.family-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "3pt"
    height: "44pt"
  plan-date:
    backgroundColor: "{colors.family-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    width: "56pt"
    height: "66pt"
---

# Design System: Porchlight

## Overview

**Creative North Star: "The daily page"**

Porchlight reads like a familiar daily agenda: a quiet paper ground, white task surfaces, charcoal text and clearly dated plans. The lamp gives status a recognizable visual presence. Plain words state the status and the next action.

The older person's experience makes reading and acting spacious; the family experience fits more coordination into compact rows. They share materials and appointments while retaining different type and control sizes. This document records the implemented consumer system; the retained dark palette and volunteer desk are outside this redesign.

**Key Characteristics:**

- Quiet paper grounds, white surfaces and hairline separation.
- Atkinson Hyperlegible for the older person; native system type for family.
- Persistent labeled bottom tabs and a shared dated appointment row.
- Large senior actions and compact family coordination.
- Written status, ownership and simulation labels.

Source evidence: `mobile/src/design/tokens.js`, `ui.js`, `theme.js`, `AppTabs.js`, `PlanRow.js`, `mobile/App.js`, `SeniorScreen.js` and `FamilyScreen.js`. Direction evidence: `PRODUCT.md`, `.impeccable/surfaces/mobile.md` and the selected `pick` option in `.impeccable/questions/design-choice.json`. Screenshots in `.impeccable/review/` are browser previews. Windows supplies no iOS Simulator or physical-device capture here; native safe areas, Dynamic Type, VoiceOver, keyboard behavior and SF Symbol rendering still require device validation.

No raster was generated for this world. The six inherited files in `mobile/assets/` carry embedded provenance recording inheritance from main commit `50b9a89`; their original creator is unknown. Provenance scanning reported six files and zero missing records. Dependency rasters are unchanged. These assets do not establish a new illustration or photography language.

## Colors

The palette uses cool neutral coordination surfaces for family and warmer paper for the older person.

### Primary

- **Charcoal ink:** text, primary family buttons and the senior check-in action. The `lamp` BigButton tone resolves to charcoal in the current consumer themes.
- **Porch amber:** the lamp, warning cues, and the conversation Send action. Soft amber backgrounds and darker amber text make pending states readable.

### Secondary

- **Confirmation green:** confirmed transport and completed status, with soft background and darker text companions.

### Tertiary

- **Help red:** help requests and scam warnings, with soft background and darker text companions. It is reserved for these states.

### Neutral

- **Family ground / senior paper:** the two screen canvases.
- **White surface:** cards, fields and the bottom navigation.
- **Family sunken / senior sunken:** selected navigation, neutral badges, date blocks and conversation surfaces.
- **Secondary ink / muted ink / faint ink:** progressively quieter supporting information, using audience-specific muted values.
- **Hairline / strong line:** subtle separation and clearer control boundaries, using the matching audience palette.

**The Lamp Rule.** The lamp is the signature accent. Pair its state with written status; color alone never carries the update.

## Typography

**Display Font:** React Native system default for family, SF Pro on iOS.
**Body Font:** React Native system default for family; Atkinson Hyperlegible for the older person.
**Reading Font:** Loaded Atkinson regular and bold faces; the italic face is available from the app font loader.

The family hierarchy uses size and weight to distinguish page titles, rows and metadata. Senior text uses the named reading faces, generous leading and sentence-case language. React Native leaves the family `fontFamily` unset; the browser sidecar's system stack is an illustrative fallback, not the native font implementation.

### Hierarchy

- **Display:** family page titles.
- **Title / headline:** status names, card titles and actionable rows.
- **Body / callout:** summaries, explanations and compact plan details.
- **Footnote / label:** supporting dates, ownership and section titles.
- **Read title / read headline:** senior page titles and action titles.
- **Read / read small:** senior explanations, dates, places and status.

The normative sizes and leading are in the frontmatter. Senior-themed `T` components using a non-reading variant enforce at least 20pt text and 28pt leading. Explicit reading variants use their declared leading. Family bottom-tab labels use 12pt/16pt; senior tabs use Atkinson bold at 20pt/26pt.

**The Reading Floor Rule.** Senior text is at least 20pt. Keep controls and text able to grow with the user's font scale.

## Layout

All measurements in the frontmatter are React Native logical points, expressed as pt for the iOS target. They are not CSS physical points. Browser sidecar snippets map these logical dimensions to CSS pixels for approximate component previews.

The brand header sits above the route content with top safe-area padding. Scroll views occupy the remaining route area above persistent tabs. Consumer content uses 24pt horizontal insets and 28pt top padding; senior content has a 20pt vertical gap and a 680pt maximum width, family content a 24pt gap and a 760pt maximum width. Both center within wider windows.

Senior Today orders the title and lamp, date and daily check-in status, next appointment and large check-in action. At window width below 360pt or font scale above 1.2, it removes the introductory sentence and moves the check-in action ahead of the appointment. Further actions remain available by scrolling.

Family Today uses a compact status and Call surface, conditional attention/decision rows, an actionable shared-task link, the next appointment, task rows and then check-in facts/history. This is the current Today composition, not a required ordering for every future screen.

Facts wrap with a 120pt minimum width and flex basis, using a 16pt gap. Family action groups also wrap. The shared appointment row has a 16pt gap, 20pt vertical padding and a hairline divider; family gets a 56pt by 66pt date block while senior receives the full date and time in readable text.

Bottom-tab height is `base + bottom safe area + max(0, fontScale - 1) × 32pt`, with a 76pt family base or 104pt senior base. The bar uses 4pt top padding and at least 4pt bottom padding. It hides while the keyboard is open.

**The Labeled Navigation Rule.** Persistent tabs carry icons and visible words. Senior uses Today / My plans / Family; family uses Today / Plans / Family / Settings. Peer screen switches have no transition animation.

## Elevation & Depth

Tonal layering and hairline borders establish most depth. The small card shadow is attached to light secondary buttons and the segmented selector, rather than every content card. Floating surfaces use the separate float token where their component implementation calls for it.

### Shadow Vocabulary

- **Card:** native black shadow, opacity 0.04, radius 8pt, offset (0pt, 2pt).
- **Float:** native black shadow, opacity 0.12, radius 24pt, offset (0pt, 8pt).

These are React Native shadow properties. Sidecar CSS approximations support browser inspection and do not prove native rendering.

## Shapes

Controls use gently rounded corners: small buttons and date blocks use the small radius, primary senior actions and cards use the medium/large radius, and notice/verdict surfaces use the extra-large radius. Status badges are pills. Navigation is a full-width native bar. Separation uses `StyleSheet.hairlineWidth` rather than a fixed physical-pixel stroke; BigButton uses a 1pt border.

## Components

### Buttons

Labels say what happens. Family Button defaults to 48pt minimum height; small and large variants use 44pt and 56pt, with 14pt or 18pt horizontal padding. Senior-themed Button has a 104pt minimum and Atkinson bold 22pt labels. Primary is charcoal, secondary white with a stronger boundary, ghost transparent, danger red and lamp amber.

BigButton is a full-width senior action with a 104pt minimum, 20pt padding, readable title and optional explanation. Its plain tone is white, check-in tone charcoal, and help tone soft red. Icons support labeled controls. Busy controls replace content with a spinner and disable repeated action; disabled Press content uses 0.45 opacity.

Press scales to 0.97 in 120ms on press-in and restores over 160ms using the ease-out curve. Reduce Motion prevents the press-in scale. Feedback uses the existing haptics, toast and sheet components.

### Chips

Badge uses a compact 12pt semibold label, pill shape and soft neutral, amber, green or red state treatment. It belongs to the denser family experience; senior transport status uses a written reading-size line.

### Cards / Containers

Card uses a white surface, hairline border, 18pt padding and 12pt internal gap. Grouped task lists override vertical padding and use dividers. The compact family status surface uses 16pt padding and an 8pt gap.

### Inputs / Fields

Senior conversation input is white with the stronger senior line, 18pt horizontal padding, a 60pt minimum and Atkinson 22pt text; the scam textarea has a 150pt minimum. The Send action is 104pt square. Family's inline task field uses a 44pt minimum and 16pt system text. Field focus/error visuals beyond the existing native behavior are not established as reusable tokens.

### Navigation

Bottom tabs use charcoal selected labels, muted inactive labels and a sunken selected ground. Native iOS icons use SF Symbols; the browser preview uses inline SVG outlines from `Icon.js`. The Family screen nests People / Stories in a segmented control: a sunken track, white pill and 44pt minimum options. Its content swaps without a slide.

### Shared Appointment Row

PlanRow connects both audiences through the same appointment, place, date and transport state. Family receives a date block and badge; senior receives a large title and text status. Simulated confirmation is explicitly labeled as a demo ride. The row remains informational; actionable plan/task links use labeled controls elsewhere.

### Lamp and Motion

The lamp is vector artwork. Lit and dim are steady; unresolved amber breathes and help pulses. Reduce Motion makes the glow steady and removes the scale celebration. Ordinary entering content uses short fades or fade-up motion; tab content does not animate when opened. Existing lamp glow and state pulses have longer durations than control feedback, so a universal sub-300ms rule would misdescribe this component.

## Do's and Don'ts

### Do:

- **Do** use the audience's palette and typography from the shared theme.
- **Do** keep senior text at least 20pt and senior action controls at least 104pt tall.
- **Do** keep family action controls at least 44pt tall.
- **Do** retain visible labels, written status and native safe-area allowances.
- **Do** reuse PlanRow for appointments and distinguish simulated transport in words.
- **Do** let facts, action groups and enlarged text wrap rather than truncate the next step.
- **Do** keep native device validation separate from browser preview evidence.

### Don't:

- **Don't** add a new accent or one-off button style outside the existing tokens and variants.
- **Don't** use red for ordinary pending or missed-check-in states.
- **Don't** animate peer tab switches.
- **Don't** treat a simulated booking or requested contact as confirmed real-world completion.
- **Don't** infer a house illustration style or creator attribution from inherited app assets.

Not canonized: retained one-off conversation colors and any unguarded segmented-selector animation are implementation drift, not reusable design rules. This documentation does not repair application code.
