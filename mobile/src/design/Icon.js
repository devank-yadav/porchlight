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
  iphone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M11 18.5h2',
  'speaker.wave.2': 'M3 9h4l5-4v14l-5-4H3V9Z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
  'speaker.slash': 'M3 9h4l5-4v14l-5-4H3V9Z M16 9l5 6 M21 9l-5 6',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2Z M10 21h4',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3V8Z M15.5 13.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
  photo: 'M3 5h18v14H3V5Z M3 16l5-5 4 4 3-3 6 6 M16 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
  lightbulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z',
  'exclamationmark.triangle': 'M12 3 2 20h20L12 3Z M12 9v5 M12 17v.5',
  'exclamationmark.octagon': 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z M12 7v6 M12 16v.5',
  'exclamationmark.circle': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v6 M12 16v.5',
  'info.circle': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7.5v.5',
  'checkmark.shield': 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Z M8 12l3 3 5-6',
  'shield.lefthalf.filled': 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Z M12 3v19',
  xmark: 'M6 6l12 12 M18 6 6 18',
  waveform: 'M3 11v2 M6 9v6 M9 5v14 M12 8v8 M15 4v16 M18 9v6 M21 11v2',
  'square.and.arrow.up': 'M12 3v12 M8 7l4-4 4 4 M5 11v9h14v-9',
  sparkles: 'M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8L10 3Z M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z',
  play: 'M7 4v16l13-8L7 4Z',
  'phone.down': 'M2 14c0-3 4.5-6 10-6s10 3 10 6l-1 2-4-1v-3c-2-1-8-1-10 0v3l-4 1-1-2Z',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z',
  message: 'M21 12c0 4.4-4 8-9 8-1.5 0-3-.3-4.2-.9L3 20l1.2-4A7.6 7.6 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z',
  hourglass: 'M6 3h12 M6 21h12 M7 3c0 5 5 6 5 9s-5 4-5 9 M17 3c0 5-5 6-5 9s5 4 5 9',
  flask: 'M9 3h6 M10 3v6L4 20h16l-6-11V3',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  book: 'M5 4a2 2 0 0 1 2-2h12v17H7a2 2 0 0 0-2 2V4Z M5 21a2 2 0 0 1 2-2h12v2',
  'arrow.uturn.backward': 'M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  'arrow.counterclockwise': 'M4 8a9 9 0 1 1-1 8 M4 3v5h5',
  mappin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  'person.crop.circle': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M6.5 18.5a6 6 0 0 1 11 0',
  'questionmark.bubble': 'M3 3h18v14H8l-5 4V3 M9.5 8a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2 M12 14.5v.5',
  bag: 'M5 8h14l-1 13H6L5 8Z M9 8V6a3 3 0 0 1 6 0v2',
  briefcase: 'M3 7h18v13H3V7Z M8 7V4h8v3 M3 13h18',
  cart: 'M3 4h2l2 12h11l2-8H6 M9 20.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0 M18 20.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0',
  cup: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z M16 9h2a2 2 0 0 1 0 4h-2 M3 21h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  figure: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M12 8v6 M8 10l4-2 4 2 M12 14l-3 7 M12 14l3 7',
  fork: 'M7 3v8 M5 3v5a2 2 0 0 0 4 0V3 M7 11v10 M17 3c-2 2-2 6 0 8v10',
  hammer: 'M14 4l6 6-3 3-6-6 3-3Z M11 7 3 15l3 3 8-8',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z',
  leaf: 'M5 19C5 10 11 5 20 5c0 9-5 15-14 15 M5 19c3-4 6-7 10-9',
  lock: 'M6 11h12v10H6V11Z M8 11V7a4 4 0 0 1 8 0v4',
  music: 'M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  note: 'M5 3h10l4 4v14H5V3Z M8 10h8 M8 14h8 M8 18h5',
  checklist: 'M3 6l2 2 3-3 M3 13l2 2 3-3 M11 7h10 M11 14h10 M11 20h10',
  'person.3': 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a6 6 0 0 1 12 0v2 M16 4a4 4 0 0 1 0 8 M17 15a5 5 0 0 1 5 5v1',
};
export default function Icon({ name, size = 20, color = '#252B2A', weight = 'semibold', style }) {
  const key = name.replace(/\.fill$/, '');
  const parts = key.split('.');
  let path;
  for (let n = parts.length; n > 0 && !path; n--) path = paths[parts.slice(0, n).join('.')];
  if (!path) path = key.includes('shield') ? paths.shield : paths['checkmark.circle'];
  const fallback = <Svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden={true}><Path d={path} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
  if (Platform.OS !== 'ios') return fallback;
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" fallback={fallback} style={[{ width: size, height: size }, style]} accessible={false} importantForAccessibility="no" />;
}
