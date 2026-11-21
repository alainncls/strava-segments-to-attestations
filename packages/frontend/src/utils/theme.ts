export type ThemeMode = 'system' | 'light' | 'dark';

// Same key as public/theme.js, which applies the theme before the first paint.
const STORAGE_KEY = 'theme';
const CHANGE_EVENT = 'themechange';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemeMode(): ThemeMode {
  try {
    const mode = localStorage.getItem(STORAGE_KEY);
    return mode === 'light' || mode === 'dark' ? mode : 'system';
  } catch {
    return 'system';
  }
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice applies to this page only.
  }
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resolvedTheme(): 'light' | 'dark' {
  const mode = document.documentElement.dataset.theme;
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function onThemeChange(listener: () => void): () => void {
  const media = window.matchMedia?.(DARK_QUERY);
  window.addEventListener(CHANGE_EVENT, listener);
  media?.addEventListener('change', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    media?.removeEventListener('change', listener);
  };
}
