import { Easing } from 'react-native-reanimated';

// Porchlight design tokens: "evening porch".
// Warm paper, white cards with hairlines and soft warm depth. The porch light (amber) is the only
// accent; red is reserved for help and scams, green for "confirmed". The one dark, bold surface on a
// screen is the night hero card, where the lamp glows.

// Family and desk: warm paper.
export const light = {
  bg: '#F6F2EC',
  surface: '#FFFFFF',
  surface2: '#FBF8F4',
  sunken: '#F1EBE3',
  raised: '#F1EBE3',
  ink: '#1E1915',
  ink2: '#4A423B',
  muted: '#776D63',
  faint: '#A0958A',
  line: 'rgba(30,25,21,0.08)',
  lineStrong: 'rgba(30,25,21,0.14)',
  primary: '#1E1915',
  onPrimary: '#FFFFFF',
};

// Peggy's side: the same paper, a touch lighter, with higher-contrast secondary text for low vision.
export const seniorPalette = { ...light, bg: '#F8F4EE', muted: '#5F564D' };

// The night hero card (the porch at dusk). Used only behind the lamp.
export const night = {
  bg: '#1B1613',
  surface: '#2A221D',
  surface2: '#231C18',
  sunken: '#2A221D',
  raised: '#2A221D',
  ink: '#FFF7EC',
  ink2: '#EADFD2',
  muted: '#B9AA99',
  faint: '#8C7E70',
  line: 'rgba(255,247,236,0.10)',
  lineStrong: 'rgba(255,247,236,0.18)',
  primary: '#FFF7EC',
  onPrimary: '#1B1613',
};

// Retained for dark sheets (demo controls); aligned to the night palette.
export const dark = { ...night, bg: '#1B1613', surface: '#231C18' };

export const accent = {
  lamp: '#F5A524',
  lampDeep: '#E08A12',
  lampInk: '#241500',
  lampSoft: '#FDF1DC',
  lampText: '#8A5300',
  lampGlow: 'rgba(245,165,36,0.35)',
  red: '#D93F2B',
  redSoft: '#FCEAE6',
  redText: '#A8291A',
  green: '#2F8A4E',
  greenSoft: '#E6F3EA',
  greenText: '#1F6B3B',
};

export const font = {
  // Peggy's side: Atkinson Hyperlegible, designed for low vision.
  read: 'AtkinsonHyperlegible_400Regular',
  readBold: 'AtkinsonHyperlegible_700Bold',
  readItalic: 'AtkinsonHyperlegible_400Regular_Italic',
  // Everything else: the system font (SF Pro), which ships optical sizing.
  ui: undefined,
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 20, section: 28 };

// Warm, soft depth (brown-tinted shadows read as light, not dirt, on paper).
export const shadow = {
  card: { shadowColor: '#3B2A1A', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  float: { shadowColor: '#3B2A1A', shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } },
};

// Motion (Emil Kowalski's values). Never ease-in on UI; stay under 300ms.
export const ease = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
};
export const easeCss = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
};
export const spring = {
  settle: { duration: 400, dampingRatio: 1 },
  snap: { duration: 400, dampingRatio: 0.8 },
  sheet: { duration: 300, dampingRatio: 0.8 },
};

// Momentum projection (where a flick was going) and rubber-banding (soft edges).
export function project(velocity, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}
export function rubberband(overshoot, dimension, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
