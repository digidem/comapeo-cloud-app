import { describe, expect, it } from 'vitest';

import { createIntl } from 'react-intl';

import {
  isKnownSeverity,
  severityToLabel,
  severityToVariant,
} from '@/components/ui/badge-severity';
import { getMessages } from '@/i18n/load-messages';

const intl = createIntl({ locale: 'en', messages: getMessages('en') });

describe('badge severity helpers', () => {
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
