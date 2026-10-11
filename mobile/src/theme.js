// Porchlight design tokens: an evening theme. Near-black blue ground, charcoal-dusk surfaces,
// off-white ink, one warm element (the porch light). Token names are kept from the light theme;
// every text/background pair below has at least 4.5:1 contrast.
export const color = {
  sky: '#0A0F1C', // page background
  surface: '#161D2E', // cards
  surface2: '#1F2840', // nested panels (Inset), inputs, neutral chips
  dusk: '#1A2547', // dusk-blue panels (hero cards)
  dusk2: '#2A3658', // secondary panels, chat bubbles, tab highlight
  ink: '#EEF1F8', // body and heading text
  muted: '#A3AEC8',
  mutedOnDusk: '#C3CCE0',
  line: '#273049', // solid dividers and progress tracks
  hairline: 'rgba(255,255,255,0.10)', // 1px borders on cards and buttons
  highlight: 'rgba(255,255,255,0.15)', // 1px top inside edge on cards and buttons
  lamp: '#F5A524',
  lampInk: '#2A1A00',
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

// sm: buttons, inputs and nested panels. lg: cards.
export const radius = { sm: 14, lg: 24 };

export const motion = { enter: 160, enterOffset: 8, pressScale: 0.97 };
