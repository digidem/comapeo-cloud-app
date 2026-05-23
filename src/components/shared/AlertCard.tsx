import { type ReactNode } from 'react';
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
  noLocation: {
    id: 'alertCard.noLocation',
    defaultMessage: 'No location',
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

/** Extract [lon, lat] from a GeoJSON Point geometry, or null if not a Point. */
function getPointCoords(geometry: Alert['geometry']): [number, number] | null {
  if (!geometry || geometry.type !== 'Point') return null;
  const coords = geometry.coordinates;
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    return [coords[0] as number, coords[1] as number];
  }
  return null;
}

function LocationPin(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-text-muted"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const intl = useIntl();
  const metadata = alert.metadata ?? {};
  const severity = metadata.severity as string | undefined;
  const alertType = metadata.alert_type as string | undefined;
  const variant = severityToVariant(severity);
  const severityLabel = severityToLabel(severity, intl);
  const pointCoords = getPointCoords(alert.geometry);

  // Date range
  const hasStart = !!alert.detectionDateStart;
  const hasEnd = !!alert.detectionDateEnd;

  return (
    <div data-testid="alert-card" className="flex flex-col gap-2">
      {/* Top row: severity badge + type badge + location */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={variant}>{severityLabel}</Badge>
        {alertType && (
          <span className="rounded-pill bg-surface-container-low px-2.5 py-0.5 text-xs font-medium text-text">
            {alertType}
          </span>
        )}
        {pointCoords ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-text-muted">
            <LocationPin />
            {pointCoords[1].toFixed(4)}, {pointCoords[0].toFixed(4)}
          </span>
        ) : (
          <span className="ml-auto text-xs text-text-muted">
            {intl.formatMessage(messages.noLocation)}
          </span>
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
