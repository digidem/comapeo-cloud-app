import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { AlertCard } from '@/components/shared/AlertCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import { useProjects } from '@/hooks/useProjects';
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
});

export function AlertsScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const alertsQuery = useAlerts(selectedProjectId);

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

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-text">
          {intl.formatMessage(messages.title)}
        </h1>

        <div className="flex items-center gap-2">
          <Link
            to="/data/alerts/new"
            className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-primary-dark transition-colors text-center"
          >
            {intl.formatMessage(messages.addAlert)}
          </Link>
        </div>
      </div>

      {/* Alert content */}
      {(() => {
        if (alertsQuery.isError) {
          return (
            <div className="flex items-center justify-center p-8">
              <span className="text-error text-sm">
                {intl.formatMessage(messages.alertsError)}
              </span>
            </div>
          );
        }
        if (alertsQuery.isPending) {
          return (
            <div className="flex flex-col gap-4 p-6">
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
                to="/data/alerts/$alertId"
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
