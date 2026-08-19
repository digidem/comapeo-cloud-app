import { defineMessages } from 'react-intl';
import type { IntlShape } from 'react-intl';

import type { BadgeVariant } from '@/components/ui/badge';

const messages = defineMessages({
  severityHigh: {
    id: 'alertCard.severityHigh',
    defaultMessage: 'High',
  },
  severityMedium: {
    id: 'alertCard.severityMedium',
    defaultMessage: 'Medium',
  },
  severityLow: {
    id: 'alertCard.severityLow',
    defaultMessage: 'Low',
  },
  severityUnknown: {
    id: 'alertCard.severityUnknown',
    defaultMessage: 'Unknown',
  },
});

export function severityToVariant(severity: string | undefined): BadgeVariant {
  switch (severity?.toLowerCase()) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

export function severityToLabel(
  severity: string | undefined,
  intl: IntlShape,
): string {
  switch (severity?.toLowerCase()) {
    case 'high':
      return intl.formatMessage(messages.severityHigh);
    case 'medium':
      return intl.formatMessage(messages.severityMedium);
    case 'low':
      return intl.formatMessage(messages.severityLow);
    default:
      return intl.formatMessage(messages.severityUnknown);
  }
}

/** Returns true only for known severity values (high/medium/low). */
export function isKnownSeverity(
  severity: string | undefined,
): severity is string {
  return ['high', 'medium', 'low'].includes(severity?.toLowerCase() ?? '');
}
