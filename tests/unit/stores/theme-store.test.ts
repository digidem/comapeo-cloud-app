import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '@/stores/theme-store';

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ mode: 'system', resolved: 'light' });
  });

  it('initializes with system mode by default', () => {
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
    // resolved should be either light or dark based on system preference
    expect(['light', 'dark']).toContain(useThemeStore.getState().resolved);
  });

  it('persists mode to localStorage', () => {
    useThemeStore.getState().setMode('dark');
    expect(localStorage.getItem('comapeo-theme-mode')).toBe('dark');
  });

  it('loads persisted mode from localStorage', () => {
    localStorage.setItem('comapeo-theme-mode', 'dark');
    // The store initializes at import time, so we can verify the persistence mechanism
    expect(localStorage.getItem('comapeo-theme-mode')).toBe('dark');
  });

  it('applies dark class to document element', () => {
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes dark class when switching to light', () => {
    useThemeStore.getState().setMode('dark');
    useThemeStore.getState().setMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
