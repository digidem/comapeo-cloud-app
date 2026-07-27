import { describe, expect, it } from 'vitest';

import en from '@/i18n/messages/en.json';
import es from '@/i18n/messages/es.json';
import pt from '@/i18n/messages/pt.json';

describe('locale message files', () => {
  const translatedLocales = [
    { name: 'es', messages: es as Record<string, unknown> },
    { name: 'pt', messages: pt as Record<string, unknown> },
  ];

  for (const { name, messages } of translatedLocales) {
    describe(`${name}.json`, () => {
      it('every value is a plain string (not a message descriptor object)', () => {
        for (const [key, value] of Object.entries(messages)) {
          expect(
            typeof value,
            `Key "${key}" in ${name}.json should be a string`,
          ).toBe('string');
        }
      });

      it('has translations for the 6 previously-malformed category keys', () => {
        const keys = [
          'categories.fieldsError',
          'categories.fieldsRetry',
          'categories.hiddenBanner',
          'categories.noServer',
          'categories.showAll',
          'categories.showLatest',
        ];
        for (const key of keys) {
          expect(
            messages[key],
            `Missing key "${key}" in ${name}.json`,
          ).toBeDefined();
          expect(
            typeof messages[key],
            `Key "${key}" in ${name}.json should be a string`,
          ).toBe('string');
        }
      });
    });
  }

  it('en.json values are message descriptors with defaultMessage', () => {
    const enMessages = en as Record<string, unknown>;
    for (const [key, value] of Object.entries(enMessages)) {
      if (typeof value === 'object' && value !== null) {
        const descriptor = value as { defaultMessage?: unknown };
        expect(
          descriptor.defaultMessage,
          `en.json key "${key}" missing defaultMessage`,
        ).toBeDefined();
      }
    }
  });
});
