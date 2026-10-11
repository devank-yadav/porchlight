import { createContext, useContext } from 'react';
import { dark, light } from './tokens';

// Which palette a subtree uses. Peggy's side and the start screen are 'dark'; family and desk are 'light'.
const ThemeContext = createContext('light');
export const ThemeProvider = ThemeContext.Provider;
export function useTheme() {
  const mode = useContext(ThemeContext);
  return { mode, c: mode === 'dark' ? dark : light, isDark: mode === 'dark' };
}
