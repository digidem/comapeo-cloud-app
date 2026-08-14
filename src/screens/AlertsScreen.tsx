import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { AlertCard } from '@/components/shared/AlertCard';
import { AlertsMap } from '@/components/shared/AlertsMap';
import { InlineAlertCreationPanel } from '@/components/shared/InlineAlertCreationPanel';
import { MapScreenLayout } from '@/components/shared/MapScreenLayout';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import { useProjects } from '@/hooks/useProjects';
import type { AlertGeometry } from '@/lib/alert-form-utils';
import { useAlertViewModeStore } from '@/stores/alert-view-mode-store';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: {
    id: 'alerts.title',
    defaultMessage: 'Alerts',
  },
  noProject: {
    id: 'alerts.noProject',
    defaultMessage: 'Select a project from Home to view alerts',
  },
  noProjectLink: {
    id: 'alerts.noProjectLink',
    defaultMessage: 'Go to Home',
  },
  untitledProject: {
    id: 'alerts.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  noAlerts: {
    id: 'alerts.noAlerts',
    defaultMessage: 'No alerts yet',
  },
  loading: {
    id: 'alerts.loading',
    defaultMessage: 'Loading...',
  },
  alertsError: {
    id: 'alerts.alertsError',
    defaultMessage: 'Failed to load alerts. Please try again.',
  },
  addAlert: {
    id: 'alerts.addAlert',
    defaultMessage: 'Add Alert',
  },
  viewGrid: {
    id: 'alerts.viewGrid',
    defaultMessage: 'Grid view',
  },
  viewMap: {
    id: 'alerts.viewMap',
    defaultMessage: 'Map view',
  },
  switchToMapView: {
    id: 'alerts.switchToMapView',
    defaultMessage: 'Switch to map view',
  },
  switchToGridView: {
    id: 'alerts.switchToGridView',
    defaultMessage: 'Switch to grid view',
  },
});

function MapIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

export function AlertsScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const alertsQuery = useAlerts(selectedProjectId);
  const viewMode = useAlertViewModeStore((state) => state.viewMode);
  const setViewMode = useAlertViewModeStore((state) => state.setViewMode);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [isSelectingMapOnMobile, setIsSelectingMapOnMobile] = useState(false);
  const [mapSelectedPoint, setMapSelectedPoint] = useState<[number, number]>();
  const [draftPoint, setDraftPoint] = useState<[number, number]>();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  // Inject project name + mode label into topbar
  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.title),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  // No project selected
  if (!selectedProjectId || !selectedProject) {
    if (projectsQuery.isPending) {
      return (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton height={40} width={200} />
          <Skeleton height={200} className="rounded-card" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted text-sm">
          {intl.formatMessage(messages.noProject)}
        </p>
        <Link
          to="/"
          className="text-primary text-sm font-medium hover:underline"
        >
          {intl.formatMessage(messages.noProjectLink)}
        </Link>
      </div>
    );
  }

  const alerts = alertsQuery.data ?? [];

  function closeInlineCreation() {
    setIsCreatingInline(false);
    setIsSelectingMapOnMobile(false);
    setMapSelectedPoint(undefined);
    setDraftPoint(undefined);
  }

  function updateDraftPoint(geometry: AlertGeometry | undefined) {
    if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
      setDraftPoint(undefined);
      return;
    }
    const [longitude, latitude] = geometry.coordinates;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      setDraftPoint(undefined);
      return;
    }
    setDraftPoint([longitude, latitude]);
  }

  const addAlertLink = (
    <Link
      to="/alerts/new"
      className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-3 py-2 text-center text-xs font-medium text-white no-underline transition-colors hover:bg-primary-dark"
    >
      {intl.formatMessage(messages.addAlert)}
    </Link>
  );

  if (viewMode === 'map') {
    return (
      <MapScreenLayout
        topLeft={
          <h1 className="rounded-button bg-surface-card px-3 py-2 text-xl font-bold text-text shadow-card">
            {intl.formatMessage(messages.title)}
          </h1>
        }
        topRightPositionClassName="top-4 right-3 z-30 items-center"
        topRight={
          <>
            <button
              type="button"
              onClick={() => {
                setMapSelectedPoint(undefined);
                setDraftPoint(undefined);
                setIsSelectingMapOnMobile(false);
                setIsCreatingInline(true);
              }}
              disabled={isCreatingInline}
              className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-3 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {intl.formatMessage(messages.addAlert)}
            </button>
            <button
              type="button"
              onClick={() => {
                closeInlineCreation();
                setViewMode('grid');
              }}
              className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-button bg-surface-card text-text-muted shadow-card transition-colors hover:bg-surface-container-low hover:text-text"
              aria-label={intl.formatMessage(messages.switchToGridView)}
              title={intl.formatMessage(messages.viewGrid)}
            >
              <GridIcon />
            </button>
          </>
        }
      >
        <div className="relative h-full">
          <AlertsMap
            alerts={alerts}
            height="h-full"
            basemapSwitcherPositionClassName="top-[4.25rem] right-3"
            interactionMode={isCreatingInline ? 'create-point' : 'browse'}
            onMapPointSelect={(point) => {
              setMapSelectedPoint(point);
              setDraftPoint(point);
              setIsSelectingMapOnMobile(false);
            }}
            draftPoint={draftPoint}
            showEmptyState={
              !alertsQuery.isPending &&
              !alertsQuery.isError &&
              alerts.length > 0
            }
          />

          {isCreatingInline ? (
            <InlineAlertCreationPanel
              projectLocalId={selectedProjectId}
              mapSelectedPoint={mapSelectedPoint}
              isSelectingMapOnMobile={isSelectingMapOnMobile}
              onSelectMapMobile={() => setIsSelectingMapOnMobile(true)}
              onBackToForm={() => setIsSelectingMapOnMobile(false)}
              onGeometryChange={updateDraftPoint}
              onClose={closeInlineCreation}
            />
          ) : null}

          {!isCreatingInline && alertsQuery.isError ? (
            <div
              role="alert"
              className="absolute inset-0 z-20 flex items-center justify-center bg-surface-card/80 p-8 text-center backdrop-blur-sm"
            >
              <span className="text-error text-sm">
                {intl.formatMessage(messages.alertsError)}
              </span>
            </div>
          ) : null}

          {!isCreatingInline &&
          alertsQuery.isPending &&
          !alertsQuery.isError ? (
            <div
              role="status"
              className="absolute inset-0 z-20 flex items-center justify-center bg-surface-card/80 p-8 text-center backdrop-blur-sm"
            >
              <span className="sr-only">
                {intl.formatMessage(messages.loading)}
              </span>
              <div className="w-full max-w-sm space-y-3" aria-hidden="true">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-32 w-full rounded-card" />
                <Skeleton className="h-20 w-full rounded-card" />
              </div>
            </div>
          ) : null}

          {!isCreatingInline &&
          !alertsQuery.isPending &&
          !alertsQuery.isError &&
          alerts.length === 0 ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-card/80 p-8 text-center backdrop-blur-sm">
              <span className="text-text-muted text-sm">
                {intl.formatMessage(messages.noAlerts)}
              </span>
            </div>
          ) : null}
        </div>
      </MapScreenLayout>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-text">
          {intl.formatMessage(messages.title)}
        </h1>

        <div className="flex items-center gap-2">
          {addAlertLink}
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-button bg-surface-card text-text-muted transition-colors hover:bg-surface-container-low hover:text-text"
            aria-label={intl.formatMessage(messages.switchToMapView)}
            title={intl.formatMessage(messages.viewMap)}
          >
            <MapIcon />
          </button>
        </div>
      </div>

      {/* Alert content */}
      {(() => {
        if (alertsQuery.isError) {
          return (
            <div role="alert" className="flex items-center justify-center p-8">
              <span className="text-error text-sm">
                {intl.formatMessage(messages.alertsError)}
              </span>
            </div>
          );
        }
        if (alertsQuery.isPending) {
          return (
            <div role="status" className="flex flex-col gap-4 p-6">
              <span className="sr-only">
                {intl.formatMessage(messages.loading)}
              </span>
              <Skeleton height={100} className="rounded-card" />
              <Skeleton height={100} className="rounded-card" />
            </div>
          );
        }
        if (alerts.length === 0) {
          return (
            <div className="flex items-center justify-center p-8">
              <span className="text-text-muted text-sm">
                {intl.formatMessage(messages.noAlerts)}
              </span>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alerts.map((alert) => (
              <Link
                key={alert.localId}
                to="/alerts/$alertId"
                params={{ alertId: alert.localId }}
                className="no-underline"
              >
                <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
                  <AlertCard alert={alert} />
                </Card>
              </Link>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
