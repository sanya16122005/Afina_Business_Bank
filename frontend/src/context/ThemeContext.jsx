import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'afina_theme';
const VALID_THEMES = ['light', 'dark'];

function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function detectSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme() || detectSystemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Если у пользователя нет явно сохранённой темы — следуем за системной.
  useEffect(() => {
    if (readStoredTheme()) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => setThemeState(event.matches ? 'dark' : 'light');
    media.addEventListener?.('change', handler);
    return () => media.removeEventListener?.('change', handler);
  }, []);

  const setTheme = useCallback((value, { persist = true } = {}) => {
    const normalized = VALID_THEMES.includes(value) ? value : 'light';
    setThemeState(normalized);
    if (persist) writeStoredTheme(normalized);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      writeStoredTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Безопасный fallback — компоненты вне провайдера не падают.
    return { theme: 'light', setTheme: () => {}, toggleTheme: () => {}, isDark: false };
  }
  return ctx;
}
