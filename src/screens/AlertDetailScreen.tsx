import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/useAlerts';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  backToData: {
    id: 'alertDetail.back',
    defaultMessage: 'Back to Data',
  },
  notFound: {
    id: 'alertDetail.notFound',
    defaultMessage: 'Alert not found',
  },
  details: {
    id: 'alertDetail.details',
    defaultMessage: 'Details',
  },
  geometry: {
    id: 'alertDetail.geometry',
    defaultMessage: 'Geometry',
  },
  metadata: {
    id: 'alertDetail.metadata',
    defaultMessage: 'Metadata',
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
  noGeometry: {
    id: 'alertDetail.noGeometry',
    defaultMessage: 'No geometry',
  },
  dataLabel: {
    id: 'data.title',
    defaultMessage: 'Data',
  },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
});

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

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Link
          to="/data"
          className="text-sm text-text-muted hover:text-text transition-colors"
        >
          {intl.formatMessage(messages.backToData)}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.alertTitle)}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.geometry)}
          </h3>
          {alert.geometry ? (
            <pre className="text-xs text-text-muted bg-surface-container-low p-2 rounded overflow-auto">
              {JSON.stringify(alert.geometry, null, 2)}
            </pre>
          ) : (
            <span className="text-sm text-text-muted">
              {intl.formatMessage(messages.noGeometry)}
            </span>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.details)}
          </h3>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-text-muted">
              {intl.formatMessage(messages.createdAt)}
            </span>
            <span className="text-sm text-text">
              {new Date(alert.createdAt).toLocaleString()}
            </span>
            {alert.detectionDateStart && (
              <>
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.detectionPeriod)}
                </span>
                <span className="text-sm text-text">
                  {new Date(alert.detectionDateStart).toLocaleDateString()}
                  {alert.detectionDateEnd &&
                    ` - ${new Date(alert.detectionDateEnd).toLocaleDateString()}`}
                </span>
              </>
            )}
          </div>
        </Card>
      </div>

      {alert.metadata && Object.keys(alert.metadata).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.metadata)}
          </h3>
          <pre className="text-xs text-text-muted bg-surface-container-low p-2 rounded overflow-auto">
            {JSON.stringify(alert.metadata, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
