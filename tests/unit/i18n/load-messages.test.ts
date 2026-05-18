import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES, getMessages } from '@/i18n/load-messages';

describe('getMessages', () => {
  it('returns English messages for en locale', () => {
    const messages = getMessages('en');
    expect(messages).toBeDefined();
    expect(Object.keys(messages).length).toBeGreaterThan(0);
  });

  it('returns English messages as fallback for unsupported locale', () => {
    const messages = getMessages('fr');
    const enMessages = getMessages('en');
    // French is not in the cache, so it falls back to English
    expect(messages).toEqual(enMessages);
  });

  it('returns pt messages for pt locale', () => {
    const messages = getMessages('pt');
    expect(messages).toBeDefined();
    expect(Object.keys(messages).length).toBeGreaterThan(0);
  });

  it('returns es messages for es locale', () => {
    const messages = getMessages('es');
    expect(messages).toBeDefined();
    expect(Object.keys(messages).length).toBeGreaterThan(0);
  });
});

describe('SUPPORTED_LOCALES', () => {
  it('contains en, pt, es', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('pt');
    expect(SUPPORTED_LOCALES).toContain('es');
  });
});
