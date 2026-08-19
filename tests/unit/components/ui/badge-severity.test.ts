import { describe, expect, it } from 'vitest';

import { createIntl } from 'react-intl';

import {
  isKnownSeverity,
  severityToLabel,
  severityToVariant,
} from '@/components/ui/badge-severity';
import { getMessages } from '@/i18n/load-messages';

const enMessages = getMessages('en');
const intl = createIntl({ locale: 'en', messages: enMessages });

describe('badge severity helpers', () => {
  it('uses severity message IDs that exist in the English runtime catalog', () => {
    expect(enMessages['alertCard.severityHigh']).toBe('High');
    expect(enMessages['alertCard.severityMedium']).toBe('Medium');
    expect(enMessages['alertCard.severityLow']).toBe('Low');
    expect(enMessages['alertCard.severityUnknown']).toBe('Unknown');
  });

  it.each([
    ['high', 'high', 'High'],
    ['HIGH', 'high', 'High'],
    ['medium', 'medium', 'Medium'],
    ['low', 'low', 'Low'],
  ] as const)(
    'maps %s to the expected badge variant and label',
    (severity, expectedVariant, expectedLabel) => {
      expect(severityToVariant(severity)).toBe(expectedVariant);
      expect(severityToLabel(severity, intl)).toBe(expectedLabel);
      expect(isKnownSeverity(severity)).toBe(true);
    },
  );

  it.each([undefined, '', 'critical'])(
    'uses the unknown fallback for %s',
    (severity) => {
      expect(severityToVariant(severity)).toBe('info');
      expect(severityToLabel(severity, intl)).toBe('Unknown');
      expect(isKnownSeverity(severity)).toBe(false);
    },
  );
});
