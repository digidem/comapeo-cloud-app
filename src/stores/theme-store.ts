import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const STORAGE_KEY = 'comapeo-theme-mode';

// Load persisted theme
function getPersistedMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

const initialMode = getPersistedMode();
const initialResolved = resolveTheme(initialMode);
applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: initialMode,
  resolved: initialResolved,

  setMode: (mode) => {
    const resolved = resolveTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(resolved);
    set({ mode, resolved });
  },
}));

// Listen for system theme changes. Guarded so tests that import this module
// repeatedly do not stack listeners on the same MediaQueryList.
const MQL_ATTACHED_KEY = '__comapeoThemeMqlAttached';
const globalWithFlag = globalThis as typeof globalThis & {
  [MQL_ATTACHED_KEY]?: boolean;
};

if (typeof window !== 'undefined' && !globalWithFlag[MQL_ATTACHED_KEY]) {
  globalWithFlag[MQL_ATTACHED_KEY] = true;
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      const state = useThemeStore.getState();
      if (state.mode === 'system') {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        useThemeStore.setState({ resolved });
      }
    });
}
