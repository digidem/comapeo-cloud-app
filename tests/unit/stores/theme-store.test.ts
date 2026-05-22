import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useThemeStore } from '@/stores/theme-store';
import type { ThemeMode } from '@/stores/theme-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'comapeo-theme-mode';

/**
 * Clear the MQL guard flag so we can test import-time side effects.
 */
function clearMqlGuard() {
  const key = '__comapeoThemeMqlAttached';
  const g = globalThis as typeof globalThis & { [key]?: boolean };
  delete g[key];
}

/**
 * Helper to import the theme store module dynamically after optionally
 * seeding localStorage and mocking matchMedia. Returns the store and the
 * captured MQL change listener (if any).
 */
async function importStore(opts?: {
  storedValue?: string | null;
  systemPrefersDark?: boolean;
}) {
  // Reset module cache so the dynamic import re-runs module-level code
  vi.resetModules();
  clearMqlGuard();

  // Seed localStorage before import
  localStorage.clear();
  if (opts?.storedValue !== undefined && opts?.storedValue !== null) {
    localStorage.setItem(STORAGE_KEY, opts.storedValue);
  }

  // Override matchMedia mock from setup.ts so we can capture the listener
  let mqlChangeListener: ((e: MediaQueryListEvent) => void) | null = null;
  const prefersDark = opts?.systemPrefersDark ?? false;

  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const mql = {
      matches: prefersDark,
      media: query,
      onchange: null as MediaQueryList['onchange'],
      addListener: vi.fn() as unknown as MediaQueryList['addListener'],
      removeListener: vi.fn() as unknown as MediaQueryList['removeListener'],
      addEventListener: vi.fn(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          _options?: boolean | AddEventListenerOptions,
        ) => {
          if (type === 'change' && typeof listener === 'function') {
            mqlChangeListener = listener as (e: MediaQueryListEvent) => void;
          }
        },
      ) as unknown as MediaQueryList['addEventListener'],
      removeEventListener:
        vi.fn() as unknown as MediaQueryList['removeEventListener'],
      dispatchEvent: vi.fn(
        () => false,
      ) as unknown as MediaQueryList['dispatchEvent'],
    } as MediaQueryList;
    return mql;
  });

  // Dynamic import — runs all the import-time side effects
  const mod = await import('@/stores/theme-store');

  return {
    useThemeStore: mod.useThemeStore,
    get changeListener() {
      return mqlChangeListener;
    },
  };
}

// ---------------------------------------------------------------------------
// Basic operations (uses static import — no module reset needed)
// ---------------------------------------------------------------------------

describe('useThemeStore — basic operations', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store to known state — import-time defaults already ran
    useThemeStore.setState({
      mode: 'system' as ThemeMode,
      resolved: 'light' as const,
    });
  });

  it('initializes with system mode by default (after reset)', () => {
    expect(useThemeStore.getState().mode).toBe('system');
  });

  it('sets mode to light', () => {
    useThemeStore.getState().setMode('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState().resolved).toBe('light');
  });

  it('sets mode to dark', () => {
    useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
  });

  it('sets mode to system', () => {
    useThemeStore.getState().setMode('system');
    expect(useThemeStore.getState().mode).toBe('system');
    expect(['light', 'dark']).toContain(useThemeStore.getState().resolved);
  });

  it('persists mode to localStorage', () => {
    useThemeStore.getState().setMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('multiple setMode calls in sequence work correctly', () => {
    useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');

    useThemeStore.getState().setMode('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState().resolved).toBe('light');

    useThemeStore.getState().setMode('system');
    expect(useThemeStore.getState().mode).toBe('system');
    expect(['light', 'dark']).toContain(useThemeStore.getState().resolved);

    // Back to dark
    useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// applyTheme behavior
// ---------------------------------------------------------------------------

describe('applyTheme — document element changes', () => {
  beforeEach(() => {
    // Start clean
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    useThemeStore.setState({
      mode: 'system' as ThemeMode,
      resolved: 'light' as const,
    });
  });

  it('applies dark class and data-theme to document element', () => {
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class and sets light data-theme when switching to light', () => {
    // First set dark
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Then switch to light
    useThemeStore.getState().setMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggling between dark and light multiple times works', () => {
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useThemeStore.getState().setMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useThemeStore.getState().setMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPersistedMode — import-time behavior (covers line 40: stored='system')
// ---------------------------------------------------------------------------

describe('getPersistedMode — import-time initialization', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns "system" when localStorage has "system" (covers line 40)', async () => {
    const { useThemeStore: store } = await importStore({
      storedValue: 'system',
    });
    expect(store.getState().mode).toBe('system');
  });

  it('returns "dark" when localStorage has "dark"', async () => {
    const { useThemeStore: store } = await importStore({ storedValue: 'dark' });
    expect(store.getState().mode).toBe('dark');
  });

  it('returns "light" when localStorage has "light"', async () => {
    const { useThemeStore: store } = await importStore({
      storedValue: 'light',
    });
    expect(store.getState().mode).toBe('light');
  });

  it('returns "system" when localStorage has an invalid value', async () => {
    const { useThemeStore: store } = await importStore({
      storedValue: 'invalid-value',
    });
    expect(store.getState().mode).toBe('system');
  });

  it('returns "system" when localStorage is empty (null)', async () => {
    const { useThemeStore: store } = await importStore({ storedValue: null });
    expect(store.getState().mode).toBe('system');
  });

  it('resolves to system theme on import when mode is system and OS is dark', async () => {
    const { useThemeStore: store } = await importStore({
      storedValue: 'system',
      systemPrefersDark: true,
    });
    expect(store.getState().mode).toBe('system');
    expect(store.getState().resolved).toBe('dark');
  });

  it('resolves to system theme on import when mode is system and OS is light', async () => {
    const { useThemeStore: store } = await importStore({
      storedValue: 'system',
      systemPrefersDark: false,
    });
    expect(store.getState().mode).toBe('system');
    expect(store.getState().resolved).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// MQL guard flag (covers lines 68-69)
// ---------------------------------------------------------------------------

describe('MQL guard flag — prevents duplicate listener attachment', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('attaches listener on first import when flag is not set', async () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia');
    clearMqlGuard();

    // First import — should attach the listener
    await import('@/stores/theme-store');

    // Verify matchMedia was called (to get the MQL) and addEventListener was called
    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });

  it('does not attach listener on second import when flag is already set', async () => {
    // First import sets the guard flag
    await import('@/stores/theme-store');

    // Now verify the guard flag is set
    const key = '__comapeoThemeMqlAttached';
    const g = globalThis as typeof globalThis & { [key]?: boolean };
    expect(g[key]).toBe(true);

    // Now spy on matchMedia AFTER the first import
    const matchMediaSpy = vi.spyOn(window, 'matchMedia');

    // Reset modules and re-import — the guard flag persists on globalThis
    vi.resetModules();
    await import('@/stores/theme-store');

    // The guard flag should still be true (second import did not try to attach again)
    expect(g[key]).toBe(true);

    // getSystemTheme calls matchMedia (for resolveTheme during init), but the
    // guard flag proves addEventListener was not re-attached on the second import.
    expect(matchMediaSpy).toHaveBeenCalledTimes(1);

    // matchMedia may be called in getSystemTheme, but the guard prevents
    // the addEventListener path on the second import.
    // The fact that the flag is still set proves the guard worked.
    // We also verify no error was thrown and the module imported fine.
  });
});

// ---------------------------------------------------------------------------
// MQL change listener (covers line 74: state.mode === 'system')
// ---------------------------------------------------------------------------

describe('MQL change listener — system theme follows OS changes', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('updates resolved theme when OS changes to dark while mode is system', async () => {
    const { useThemeStore: store, changeListener } = await importStore({
      storedValue: 'system',
      systemPrefersDark: false,
    });

    // Initially resolved should be light (OS prefers light)
    expect(store.getState().resolved).toBe('light');

    // Simulate OS switching to dark
    expect(changeListener).not.toBeNull();

    // Re-mock matchMedia to return dark on next call
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: true, // Now prefers dark
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));

    // Trigger the change listener
    changeListener!({ matches: true } as unknown as MediaQueryListEvent);

    expect(store.getState().resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does NOT update resolved theme when OS changes but mode is not system (covers line 74)', async () => {
    const { useThemeStore: store, changeListener } = await importStore({
      storedValue: 'dark',
      systemPrefersDark: false,
    });

    // Mode is dark, resolved is dark
    expect(store.getState().mode).toBe('dark');
    expect(store.getState().resolved).toBe('dark');

    // Re-mock matchMedia to return light
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));

    // Trigger the change listener — should NOT update because mode is 'dark', not 'system'
    changeListener!({ matches: false } as unknown as MediaQueryListEvent);

    // Resolved should still be dark
    expect(store.getState().resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates resolved theme when OS changes back to light while mode is system', async () => {
    const { useThemeStore: store, changeListener } = await importStore({
      storedValue: 'system',
      systemPrefersDark: true,
    });

    // Initially resolved should be dark (OS prefers dark)
    expect(store.getState().resolved).toBe('dark');

    // Re-mock matchMedia to return light
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));

    // Trigger the change listener
    changeListener!({ matches: false } as unknown as MediaQueryListEvent);

    expect(store.getState().resolved).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setMode + localStorage persistence round-trip
// ---------------------------------------------------------------------------

describe('setMode persistence round-trip', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('persists dark mode and a fresh import picks it up', async () => {
    // Set mode to dark and persist
    const first = await importStore({ storedValue: 'light' });
    first.useThemeStore.getState().setMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    // Import fresh — should read 'dark' from localStorage
    const second = await importStore({ storedValue: 'dark' });
    expect(second.useThemeStore.getState().mode).toBe('dark');
    expect(second.useThemeStore.getState().resolved).toBe('dark');
  });

  it('persists light mode and a fresh import picks it up', async () => {
    const first = await importStore({ storedValue: 'dark' });
    first.useThemeStore.getState().setMode('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    const second = await importStore({ storedValue: 'light' });
    expect(second.useThemeStore.getState().mode).toBe('light');
    expect(second.useThemeStore.getState().resolved).toBe('light');
  });

  it('persists system mode and a fresh import picks it up', async () => {
    const first = await importStore({ storedValue: 'dark' });
    first.useThemeStore.getState().setMode('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');

    const second = await importStore({ storedValue: 'system' });
    expect(second.useThemeStore.getState().mode).toBe('system');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: setMode with all modes, document guards
// ---------------------------------------------------------------------------

describe('setMode edge cases', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({
      mode: 'system' as ThemeMode,
      resolved: 'light' as const,
    });
  });

  it('setMode does not throw for any valid mode', () => {
    expect(() => useThemeStore.getState().setMode('dark')).not.toThrow();
    expect(() => useThemeStore.getState().setMode('light')).not.toThrow();
    expect(() => useThemeStore.getState().setMode('system')).not.toThrow();
  });

  it('setMode to dark persists and applies correctly', () => {
    useThemeStore.getState().setMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setMode to light persists and applies correctly', () => {
    // Start dark
    useThemeStore.getState().setMode('dark');
    // Switch to light
    useThemeStore.getState().setMode('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState().resolved).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
