import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ThemeValues {
  accent: string;
  theme: 'light' | 'dark';
  contentFont: 'sans' | 'serif';
  editorWidth: 'narrow' | 'comfortable' | 'wide';
}

export interface ThemeState extends ThemeValues {
  set: <K extends keyof ThemeValues>(key: K, value: ThemeValues[K]) => void;
}

export const ACCENT_OPTIONS = ['#4f5bd5', '#2f7bf6', '#3f9b6b', '#c2683a', '#1c1c1a'];

const DEFAULTS: ThemeValues = {
  accent: '#4f5bd5',
  theme: 'light',
  contentFont: 'sans',
  editorWidth: 'comfortable',
};
const STORAGE_KEY = 'blockpress.theme';
const WIDTHS: Record<ThemeValues['editorWidth'], string> = {
  narrow: '640px',
  comfortable: '720px',
  wide: '880px',
};

const ThemeContext = createContext<ThemeState | null>(null);

function load(): ThemeValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ThemeValues>) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<ThemeValues>(load);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', values.accent);
    root.setAttribute('data-theme', values.theme);
    root.setAttribute('data-content-font', values.contentFont);
    root.style.setProperty('--content-width', WIDTHS[values.editorWidth]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      /* ignore */
    }
  }, [values]);

  const set: ThemeState['set'] = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  return <ThemeContext.Provider value={{ ...values, set }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
