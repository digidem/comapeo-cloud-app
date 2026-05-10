import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useLocaleStore } from '@/stores/locale-store';

beforeEach(() => {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'en' });
});

afterEach(() => {
  localStorage.clear();
});

describe('locale-store', () => {
  it('default locale is "en"', () => {
    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('setLocale changes the locale', () => {
    useLocaleStore.getState().setLocale('pt');
    expect(useLocaleStore.getState().locale).toBe('pt');
  });

  it('setLocale supports all 3 languages (en, pt, es)', () => {
    const locales = ['en', 'pt', 'es'] as const;

    for (const locale of locales) {
      useLocaleStore.getState().setLocale(locale);
      expect(useLocaleStore.getState().locale).toBe(locale);
    }
  });

  it('persist middleware saves to localStorage under key "comapeo-locale"', () => {
    useLocaleStore.getState().setLocale('es');

    const stored = localStorage.getItem('comapeo-locale');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.locale).toBe('es');
  });
});
