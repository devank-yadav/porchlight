import { createContext, useContext } from 'react';
import { dark, light, night, seniorPalette } from './tokens';

// Modes: 'light' (family, desk), 'senior' (Peggy), 'dark' (dark sheets),
// 'night' / 'senior-night' (inside a HeroCard; text and controls switch to the night palette).
const ThemeContext = createContext('light');
export const ThemeProvider = ThemeContext.Provider;
export function useTheme() {
  const mode = useContext(ThemeContext);
  const isNight = mode === 'night' || mode === 'senior-night';
  const isSenior = mode === 'senior' || mode === 'senior-night';
  const c = isNight ? night : mode === 'dark' ? dark : isSenior ? seniorPalette : light;
  return { mode, c, isDark: mode === 'dark' || isNight, isSenior, isNight };
}
