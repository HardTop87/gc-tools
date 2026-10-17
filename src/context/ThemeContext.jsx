import { useEffect, useState } from 'react';
import { ThemeContext } from './theme-context';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

export function ThemeProvider({ children }) {
  // N14: localStorage kann gesperrt sein (Privatmodus, Policy) — dann gilt
  // das Systemthema statt eines Absturzes außerhalb der ErrorBoundary.
  const [theme, setThemeState] = useState(() => {
    let saved = 'system';
    try {
      saved = localStorage.getItem('gc_theme') || 'system';
    } catch {
      // Standard behalten
    }
    applyTheme(saved);
    return saved;
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  function setTheme(value) {
    try {
      localStorage.setItem('gc_theme', value);
    } catch {
      // Auswahl gilt dann nur für diese Sitzung
    }
    applyTheme(value);
    setThemeState(value);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
