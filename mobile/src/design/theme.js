import { createContext, useContext } from 'react';
import { dark, light, seniorPalette } from './tokens';

// The older person uses the spacious daily-page palette; family and desk use light.
const ThemeContext = createContext('light');
export const ThemeProvider = ThemeContext.Provider;
export function useTheme() {
  const mode = useContext(ThemeContext);
  return { mode, c: mode === 'dark' ? dark : mode === 'senior' ? seniorPalette : light, isDark: mode === 'dark', isSenior: mode === 'senior' };
}
