import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAlerts } from '@/hooks/useAlerts';
import { useObservations } from '@/hooks/useObservations';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: {
    id: 'data.title',
    defaultMessage: 'Data',
  },
  noProject: {
    id: 'data.noProject',
    defaultMessage: 'Select a project from Home to view data',
  },
  noProjectLink: {
    id: 'data.noProjectLink',
    defaultMessage: 'Go to Home',
  },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  observationsTab: {
    id: 'data.tabs.observations',
    defaultMessage: 'Observations',
  },
  alertsTab: {
    id: 'data.tabs.alerts',
    defaultMessage: 'Alerts',
  },
  noObservations: {
    id: 'data.noObservations',
    defaultMessage: 'No observations yet',
  },
  noAlerts: {
    id: 'data.noAlerts',
    defaultMessage: 'No alerts yet',
  },
  loading: {
    id: 'data.loading',
    defaultMessage: 'Loading...',
  },
  observationFallback: {
    id: 'data.observationFallback',
    defaultMessage: 'Observation',
  },
  alertFallback: {
    id: 'data.alertFallback',
    defaultMessage: 'Alert',
  },
  addAlert: {
    id: 'data.addAlert',
    defaultMessage: 'Add Alert',
  },
});

export function DataScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const observationsQuery = useObservations(selectedProjectId);
  const alertsQuery = useAlerts(selectedProjectId);

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  // Inject project name + mode label into topbar (same pattern as HomeScreen)
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

  const observations = observationsQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Title */}
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>

      {/* Tabbed content */}
      <Tabs defaultValue="observations">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="observations">
              {intl.formatMessage(messages.observationsTab)} (
              {observations.length})
            </TabsTrigger>
            <TabsTrigger value="alerts">
              {intl.formatMessage(messages.alertsTab)} ({alerts.length})
            </TabsTrigger>
          </TabsList>

          <Link
            to="/data/alerts/new"
            className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-primary-dark transition-colors text-center"
          >
            {intl.formatMessage(messages.addAlert)}
          </Link>
        </div>

        <TabsContent value="observations">
          {(() => {
            if (observationsQuery.isPending) {
              return (
                <div className="flex items-center justify-center p-8">
                  <span className="text-text-muted text-sm">
                    {intl.formatMessage(messages.loading)}
                  </span>
                </div>
              );
            }
            if (observations.length === 0) {
              return (
                <div className="flex items-center justify-center p-8">
                  <span className="text-text-muted text-sm">
                    {intl.formatMessage(messages.noObservations)}
                  </span>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {observations.map((obs) => (
                  <Link
                    key={obs.localId}
                    to="/data/observations/$observationId"
                    params={{ observationId: obs.localId }}
                    className="no-underline"
                  >
                    <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-text">
                          {obs.tags?.category
                            ? String(obs.tags.category)
                            : intl.formatMessage(messages.observationFallback)}
                        </span>
                        {obs.lat !== undefined && obs.lon !== undefined && (
                          <span className="text-xs text-text-muted">
                            {obs.lat.toFixed(4)}, {obs.lon.toFixed(4)}
                          </span>
                        )}
                        <span className="text-xs text-text-muted">
                          {new Date(obs.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="alerts">
          {(() => {
            if (alertsQuery.isPending) {
              return (
                <div className="flex items-center justify-center p-8">
                  <span className="text-text-muted text-sm">
                    {intl.formatMessage(messages.loading)}
                  </span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {alerts.map((alert) => (
                  <Link
                    key={alert.localId}
                    to="/data/alerts/$alertId"
                    params={{ alertId: alert.localId }}
                    className="no-underline"
                  >
                    <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-text">
                          {intl.formatMessage(messages.alertFallback)}
                        </span>
                        <span className="text-xs text-text-muted">
                          {new Date(alert.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
