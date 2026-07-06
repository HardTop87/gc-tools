import { createContext, useContext } from 'react';

// Context + Hook getrennt vom Provider-Component, damit die Provider-Datei
// nur Komponenten exportiert (React-Fast-Refresh).
export const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}
