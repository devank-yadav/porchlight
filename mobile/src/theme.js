// Porchlight design system: evening theme.
// Near-black blue ground, charcoal surfaces, off-white text, one warm accent (the porch light).
// Every text/background pair used in ui.js has at least 4.5:1 contrast.
export const color = {
  bg: '#0A0F1C', // page
  surface: '#161D2E', // cards
  raised: '#1F2840', // controls, inputs, panels inside cards
  dusk: '#1A2547', // the status hero card
  dusk2: '#2A3658', // selected tab, your chat bubble
  ink: '#EEF1F8', // primary text
  soft: '#C3CCE0', // secondary text on any surface
  muted: '#A3AEC8', // captions, labels
  line: '#273049', // progress tracks
  hairline: 'rgba(255,255,255,0.10)', // borders and dividers
  highlight: 'rgba(255,255,255,0.15)', // 1px top edge on cards
  lamp: '#F5A524', // the one bright accent: porch light + primary actions
  lampInk: '#2A1A00', // text on lamp
  lampSoft: '#2E2412',
  sage: '#7FCB98',
  sageSoft: '#15291D',
  brick: '#F28B74',
  brickSoft: '#3A1A17',
};

export const font = {
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  bodyItalic: 'AtkinsonHyperlegible_400Regular_Italic',
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
};

// Two radii: cards (and the big senior buttons) and controls. Pills are fully round.
export const radius = { card: 20, control: 12, pill: 999 };

// Screen edge, gap between sections, padding inside cards, gap inside a section.
export const space = { screen: 20, section: 24, card: 16, tight: 8 };

export const type = {
  display: { fontFamily: font.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: font.displaySemi, fontSize: 20, lineHeight: 24 },
  body: { fontFamily: font.body, fontSize: 17, lineHeight: 24 },
  bodyBold: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 24 },
  quote: { fontFamily: font.bodyItalic, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: font.body, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: font.bodyBold, fontSize: 13, lineHeight: 17 },
  // Peggy's side: nothing smaller than 20pt.
  seniorDisplay: { fontFamily: font.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  seniorTitle: { fontFamily: font.display, fontSize: 27, lineHeight: 31 },
  seniorBody: { fontFamily: font.body, fontSize: 21, lineHeight: 29 },
  seniorLabel: { fontFamily: font.bodyBold, fontSize: 20, lineHeight: 26 },
  seniorSub: { fontFamily: font.body, fontSize: 20, lineHeight: 26 },
};

export const motion = { enter: 160, enterOffset: 8, pressScale: 0.97 };
