import { defineMessages, useIntl } from 'react-intl';

import {
  Badge,
  severityToLabel,
  severityToVariant,
} from '@/components/ui/badge';
import type { Alert } from '@/lib/db';

const messages = defineMessages({
  sourceLabel: {
    id: 'alertCard.sourceLabel',
    defaultMessage: 'Source',
  },
  detectedOn: {
    id: 'alertCard.detectedOn',
    defaultMessage: 'Detected {date}',
  },
  detectedBetween: {
    id: 'alertCard.detectedBetween',
    defaultMessage: 'Detected {start} – {end}',
  },
  alertFallback: {
    id: 'data.alertFallback',
    defaultMessage: 'Alert',
  },
});

function formatDate(dateStr: string): string {
  // Use UTC to avoid timezone shifts — API dates are ISO strings
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const intl = useIntl();
  const severity = alert.metadata?.severity as string | undefined;
  const type = alert.metadata?.type as string | undefined;
  const variant = severityToVariant(severity);
  const severityLabel = severityToLabel(severity, intl);

  const title = type ?? intl.formatMessage(messages.alertFallback);

  // Date range
  const hasStart = !!alert.detectionDateStart;
  const hasEnd = !!alert.detectionDateEnd;

  return (
    <div data-testid="alert-card" className="flex flex-col gap-2">
      {/* Top row: severity badge + type pill */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={variant}>{severityLabel}</Badge>
        {type && <Badge variant="neutral">{type}</Badge>}
        {!type && (
          <span className="text-sm font-medium text-text">{title}</span>
        )}
      </div>

      {/* Date range */}
      {hasStart && (
        <span className="text-xs text-text-muted">
          {hasEnd
            ? intl.formatMessage(messages.detectedBetween, {
                start: formatDate(alert.detectionDateStart!),
                end: formatDate(alert.detectionDateEnd!),
              })
            : intl.formatMessage(messages.detectedOn, {
                date: formatDate(alert.detectionDateStart!),
              })}
        </span>
      )}

      {/* Source ID */}
      {alert.remoteSourceId && (
        <div data-testid="alert-source-id" className="text-xs text-text-muted">
          {intl.formatMessage(messages.sourceLabel)}: {alert.remoteSourceId}
        </div>
      )}
    </div>
  );
}
