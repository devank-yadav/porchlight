import { Easing } from 'react-native-reanimated';

// Porchlight design tokens.
// Quiet neutrals, hairline borders, soft depth. The porch light (amber) is the only bold color;
// red is reserved for help and scams, green for "confirmed".

// Family and desk: light.
export const light = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  sunken: '#F0F0EE',
  ink: '#111111',
  ink2: '#3F3F46',
  muted: '#6B6B73',
  faint: '#A1A1AA',
  line: 'rgba(0,0,0,0.08)',
  lineStrong: 'rgba(0,0,0,0.14)',
  primary: '#111111',
  onPrimary: '#FFFFFF',
};

// Peggy's side and the start screen: evening. Near-black ground so the lamp glows and text is high contrast.
export const dark = {
  bg: '#0C0C0E',
  surface: '#18181B',
  raised: '#232327',
  ink: '#FAFAFA',
  ink2: '#E4E4E7',
  muted: '#A1A1AA',
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.16)',
};

export const accent = {
  lamp: '#F5A524',
  lampInk: '#241500',
  lampSoft: '#FEF3DC',
  lampText: '#8A5300',
  red: '#D93F2B',
  redSoft: '#FDECEA',
  redText: '#A8291A',
  green: '#2F8A4E',
  greenSoft: '#E7F5EC',
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

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  float: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
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
