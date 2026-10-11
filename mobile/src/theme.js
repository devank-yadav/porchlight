// Porchlight design tokens: a calm evening theme.
// Surfaces separate by tone, not borders. One warm accent (the porch light) used sparingly.
// Every text/background pair below has at least 4.5:1 contrast. Token names are kept for older screens.
export const color = {
  sky: '#0B0F17', // page background
  surface: '#151B27', // cards and grouped lists
  surface2: '#1D2533', // inputs, secondary buttons, neutral chips, pressed rows
  surface3: '#263044', // segmented thumb, avatar circles
  dusk: '#151B27', // hero cards (same as surface: no special panels)
  dusk2: '#263044',
  ink: '#F2F4F8', // primary text
  muted: '#98A2B6', // secondary text
  mutedOnDusk: '#B6BFD1', // tertiary text that still needs to be read comfortably
  line: '#232B3A', // row dividers, progress tracks
  hairline: 'rgba(255,255,255,0.06)',
  highlight: 'rgba(255,255,255,0.05)',
  lamp: '#F5A524',
  lampInk: '#241600',
  lampSoft: 'rgba(245,165,36,0.14)',
  sage: '#6FCF97',
  sageSoft: 'rgba(111,207,151,0.13)',
  brick: '#FF8B73',
  brickSoft: 'rgba(255,139,115,0.13)',
};

export const font = {
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  bodyItalic: 'AtkinsonHyperlegible_400Regular_Italic',
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
};

// sm: buttons, inputs, chips. md: rows inside cards. lg: cards and big buttons.
export const radius = { sm: 12, md: 16, lg: 22 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const motion = { enter: 180, enterOffset: 6, pressScale: 0.98 };
