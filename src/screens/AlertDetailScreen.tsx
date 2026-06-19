import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Marker } from 'react-map-gl/maplibre';

import { Link, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { MapContainer } from '@/components/shared/MapContainer';
import {
  Badge,
  isKnownSeverity,
  severityToLabel,
  severityToVariant,
} from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import { useProjects } from '@/hooks/useProjects';
import type { Alert } from '@/lib/db';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  errorLoading: {
    id: 'alertDetail.errorLoading',
    defaultMessage: 'Failed to load alert',
  },
  tryAgain: {
    id: 'alertDetail.tryAgain',
    defaultMessage: 'Please try again later.',
  },
  notFound: {
    id: 'alertDetail.notFound',
    defaultMessage: 'Alert not found',
  },
  details: {
    id: 'alertDetail.details',
    defaultMessage: 'Details',
  },
  detectionPeriod: {
    id: 'alertDetail.detectionPeriod',
    defaultMessage: 'Detection Period',
  },
  createdAt: {
    id: 'alertDetail.createdAt',
    defaultMessage: 'Created',
  },
  alertTitle: {
    id: 'alertDetail.title',
    defaultMessage: 'Alert',
  },
  noLocation: {
    id: 'alertDetail.noLocation',
    defaultMessage: 'No location data',
  },
  location: {
    id: 'alertDetail.location',
    defaultMessage: 'Location',
  },
  coordinates: {
    id: 'alertDetail.coordinates',
    defaultMessage: 'Coordinates',
  },
  dataLabel: {
    id: 'data.title',
    defaultMessage: 'Data',
  },
  alertsLabel: {
    id: 'alerts.title',
    defaultMessage: 'Alerts',
  },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  metadataSection: {
    id: 'alertDetail.metadataSection',
    defaultMessage: 'Additional Info',
  },
  sourceLabel: {
    id: 'alertDetail.sourceLabel',
    defaultMessage: 'Source',
  },
});

// Known metadata fields that are shown as badges/cards elsewhere

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

function LocationPinIcon() {
  return (
    <svg
      width="16"
      height="16"
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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AlertDetailScreen() {
  const intl = useIntl();
  const { alertId } = useParams({ strict: false }) as {
    alertId: string;
  };
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const alertsQuery = useAlerts(selectedProjectId);
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  // Inject project name + mode label into topbar (same pattern as HomeScreen)
  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.dataLabel),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  if (alertsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-error font-semibold">
          {intl.formatMessage(messages.errorLoading)}
        </p>
        <p className="text-sm text-text-muted">
          {alertsQuery.error?.message ?? intl.formatMessage(messages.tryAgain)}
        </p>
      </div>
    );
  }

  if (alertsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={150} />
        <Skeleton height={40} width={300} />
        <Skeleton height={200} className="rounded-card" />
      </div>
    );
  }

  const alert = alertsQuery.data?.find((a) => a.localId === alertId);

  if (!alert) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted">
          {intl.formatMessage(messages.notFound)}
        </p>
      </div>
    );
  }

  const severity = alert.metadata?.severity as string | undefined;
  const alertType = alert.metadata?.alert_type as string | undefined;
  const variant = severityToVariant(severity);
  const severityLabel = severityToLabel(severity, intl);
  const pointCoords = getPointCoords(alert.geometry);

  // Filter residual metadata fields (excluding alert_type/severity shown as badges)
  const KNOWN_META_KEYS = new Set(['severity', 'alert_type']);
  const residualMeta = alert.metadata
    ? Object.entries(alert.metadata).filter(
        ([key]) => !KNOWN_META_KEYS.has(key),
      )
    : [];
  const hasDetectionEnd = !!alert.detectionDateEnd;

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Back navigation */}
      <div className="flex items-center gap-3">
        <Link
          to="/alerts"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition-colors min-h-[44px]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {intl.formatMessage(messages.alertsLabel)}
        </Link>
      </div>

      {/* Alert header: badges */}
      <div className="flex flex-wrap items-center gap-2">
        {isKnownSeverity(severity) && (
          <Badge variant={variant}>{severityLabel}</Badge>
        )}
      </div>

      <h1 className="text-2xl font-bold text-text">
        {alertType ?? intl.formatMessage(messages.alertTitle)}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Location — minimap with marker */}
        <Card className="p-0 overflow-hidden">
          {pointCoords ? (
            <>
              <div className="h-48 w-full">
                <MapContainer
                  initialViewState={{
                    longitude: pointCoords[0],
                    latitude: pointCoords[1],
                    zoom: 13,
                  }}
                  interactive={true}
                  showBasemapSwitcher={false}
                  className="h-full w-full"
                >
                  <Marker
                    longitude={pointCoords[0]}
                    latitude={pointCoords[1]}
                    anchor="bottom"
                    style={{ cursor: 'default' }}
                  >
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-danger border-2 border-white shadow-md" />
                      <div className="h-2.5 w-0.5 rounded-full bg-danger/60" />
                    </div>
                  </Marker>
                </MapContainer>
              </div>
              {/* Coordinates below the map */}
              <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-surface-card">
                <LocationPinIcon />
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.coordinates)}:{' '}
                  <span className="text-text font-mono">
                    {pointCoords[1].toFixed(6)}, {pointCoords[0].toFixed(6)}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <LocationPinIcon />
              <span className="text-sm text-text-muted">
                {intl.formatMessage(messages.noLocation)}
              </span>
            </div>
          )}
        </Card>

        {/* Details card */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.details)}
          </h3>
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-text-muted">
                {intl.formatMessage(messages.createdAt)}
              </span>
              <span className="block text-sm text-text">
                {formatDateTime(alert.createdAt)}
              </span>
            </div>
            {alert.detectionDateStart && (
              <div>
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.detectionPeriod)}
                </span>
                <span className="block text-sm text-text">
                  {formatDateShort(alert.detectionDateStart)}
                  {hasDetectionEnd &&
                    ` – ${formatDateShort(alert.detectionDateEnd!)}`}
                </span>
              </div>
            )}
            {alert.remoteSourceId && (
              <div>
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.sourceLabel)}
                </span>
                <span className="block text-sm text-text">
                  {alert.remoteSourceId}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Residual metadata — structured key-value display */}
      {residualMeta.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.metadataSection)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {residualMeta.flatMap(([key, value]) => {
              // Flatten nested objects into individual key-value pills
              if (
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value)
              ) {
                return Object.entries(value).map(([subKey, subValue]) => (
                  <span
                    key={`${key}.${subKey}`}
                    className="rounded-pill bg-surface-container-low px-3 py-1.5 text-xs text-text"
                  >
                    <span className="font-medium">{subKey}:</span>{' '}
                    {String(subValue ?? '')}
                  </span>
                ));
              }
              return (
                <span
                  key={key}
                  className="rounded-pill bg-surface-container-low px-3 py-1.5 text-xs text-text"
                >
                  <span className="font-medium">{key}:</span>{' '}
                  {String(value ?? '')}
                </span>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
