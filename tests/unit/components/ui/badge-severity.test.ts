import { describe, expect, it } from 'vitest';

import type { IntlShape } from 'react-intl';

import {
  isKnownSeverity,
  severityToLabel,
  severityToVariant,
} from '@/components/ui/badge-severity';

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }) =>
    descriptor.defaultMessage ?? '',
} as unknown as IntlShape;

describe('badge severity helpers', () => {
  it.each([
    ['high', 'high'],
    ['HIGH', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
  ] as const)('maps %s to the expected badge variant', (severity, expected) => {
    expect(severityToVariant(severity)).toBe(expected);
    expect(isKnownSeverity(severity)).toBe(true);
  });

  it.each([undefined, '', 'critical'])(
    'uses the unknown fallback for %s',
    (severity) => {
      expect(severityToVariant(severity)).toBe('info');
      expect(severityToLabel(severity, intl)).toBe('Unknown');
      expect(isKnownSeverity(severity)).toBe(false);
    },
  );
});
