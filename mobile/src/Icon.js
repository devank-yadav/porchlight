import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color as palette } from './theme';

// Small line icons drawn with react-native-svg (works in Expo Go, no icon font to load).
// 24x24 grid, 2px stroke, round caps.
const ICONS = {
  chat: <Path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20.5l1.4-4.6A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4Z" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><Circle cx="12" cy="12" r="9" /><Path d="M8 12.3l2.8 2.8L16.2 9.6" /></>,
  phone: <Path d="M21 16.5v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.5 5.2 2 2 0 0 1 4.5 3h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.4 10.9a16 16 0 0 0 4.7 4.7l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  shield: <><Path d="M12 21.5s8-3.8 8-9.8V5.3L12 2.5 4 5.3v6.4c0 6 8 9.8 8 9.8Z" /><Path d="M12 8v4.5M12 15.8v.2" /></>,
  alert: <><Path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><Path d="M12 9v4M12 17v.1" /></>,
  car: <><Path d="M5 17h14M3.5 17V12l2-5.2A2 2 0 0 1 7.4 5.5h9.2a2 2 0 0 1 1.9 1.3l2 5.2V17" /><Path d="M3.5 12h17" /><Circle cx="7.5" cy="17.5" r="1.8" /><Circle cx="16.5" cy="17.5" r="1.8" /></>,
  bag: <><Path d="M5 7.5h14l-1.2 12.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 7.5Z" /><Path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  wrench: <Path d="M14.7 6.3a4.5 4.5 0 0 0 5.6 5.6L13 19.2a2.7 2.7 0 0 1-3.8-3.8l7.3-7.3M14.7 6.3a4.5 4.5 0 0 1 5.9-.9l-3 3 .9 2.1 2.1.9 3-3" />,
  pill: <><Rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><Path d="M8.6 8.6l6.8 6.8" /></>,
  calendar: <><Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><Path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  users: <><Circle cx="9" cy="8" r="3.5" /><Path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><Path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" /></>,
  chevron: <Path d="M9 5.5l6.5 6.5L9 18.5" />,
  back: <Path d="M15 5.5L8.5 12l6.5 6.5" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  clock: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3.5 2" /></>,
  heart: <Path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7l8.8 8.8 8.8-8.8a5.4 5.4 0 0 0 0-7.7Z" />,
  sparkle: <Path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  book: <Path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15ZM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />,
  message: <><Rect x="3" y="5" width="18" height="14" rx="2.5" /><Path d="M3.5 6.5l8.5 6 8.5-6" /></>,
};

export default function Icon({ name, size = 22, color = palette.ink, strokeWidth = 2 }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {glyph}
    </Svg>
  );
}

// Which icon fits a task or request type from the server.
export const TASK_ICON = { ride: 'car', groceries: 'bag', errand: 'bag', refill: 'pill', repair: 'wrench', visit: 'heart' };
