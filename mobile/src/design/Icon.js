import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';

// Native SF Symbols; a matching outline vocabulary for the local web preview.
const paths = {
  house: 'M3 10 12 3 21 10 M5 9v12h5v-7h4v7h5V9',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M7 3v4 M17 3v4 M3 10h18 M7 14h2 M13 14h2 M7 18h2',
  'person.2': 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a6 6 0 0 1 12 0v2 M16 4a4 4 0 0 1 0 8 M17 15a5 5 0 0 1 5 5v1',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2',
  phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2Z',
  'checkmark.circle': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M7 12l3 3 7-7',
  checkmark: 'M5 12l4 4L19 6',
  'bubble.left.and.bubble.right': 'M3 3h13v11H8l-5 4V3 M18 8h3v13l-5-3h-5v-2',
  'bubble.left': 'M3 3h18v14H8l-5 4V3',
  shield: 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Z M12 7v7 M12 17v1',
  'hand.raised': 'M8 12V6a2 2 0 0 1 4 0v6 M12 10V4a2 2 0 0 1 4 0v9 M16 8a2 2 0 0 1 4 0v8c0 4-3 6-7 6-3 0-5-2-6-4L3 12a2 2 0 0 1 3-2l2 2',
  'slider.horizontal.3': 'M3 6h6 M13 6h8 M9 3v6 M3 12h11 M18 12h3 M14 9v6 M3 18h4 M11 18h10 M7 15v6',
  'chevron.down': 'M6 9l6 6 6-6', 'chevron.left': 'M15 5l-7 7 7 7', 'chevron.right': 'M9 5l7 7-7 7',
  car: 'M3 12 6 5h12l3 7v7H3v-7Z M3 12h18 M6 16h2 M16 16h2 M5 19v3 M19 19v3',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 6v6l4 2',
  plus: 'M12 4v16 M4 12h16', minus: 'M4 12h16',
  'face.smiling': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 9v1 M16 9v1 M8 15c2 3 6 3 8 0',
  pills: 'M9 4a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6-6l5-5Z M7 6l6 6 M17 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M13 18h8',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5 M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8',
  'arrow.clockwise': 'M20 8a9 9 0 1 0 1 8 M20 3v5h-5',
  'arrow.up': 'M12 20V4 M5 11l7-7 7 7',
  'magnifyingglass': 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M15 15l6 6',
  'ellipsis': 'M4 12h1 M11 12h1 M18 12h1',
  'headphones': 'M3 17v-5a9 9 0 0 1 18 0v5 M3 13h4v8H3v-8Z M17 13h4v8h-4v-8Z',
};
export default function Icon({ name, size = 20, color = '#252B2A', weight = 'semibold', style }) {
  const key = name.replace(/\.fill$/, '');
  const path = paths[key] || paths[key.split('.')[0]] || (key.includes('shield') ? paths.shield : paths['checkmark.circle']);
  const fallback = <Svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden={true}><Path d={path} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
  if (Platform.OS !== 'ios') return fallback;
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" fallback={fallback} style={[{ width: size, height: size }, style]} accessible={false} importantForAccessibility="no" />;
}
