import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useObservations } from '@/hooks/useObservations';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  backToData: {
    id: 'observationDetail.back',
    defaultMessage: 'Back to Data',
  },
  notFound: {
    id: 'observationDetail.notFound',
    defaultMessage: 'Observation not found',
  },
  details: {
    id: 'observationDetail.details',
    defaultMessage: 'Details',
  },
  location: {
    id: 'observationDetail.location',
    defaultMessage: 'Location',
  },
  noLocation: {
    id: 'observationDetail.noLocation',
    defaultMessage: 'No location data',
  },
  coordinates: {
    id: 'observationDetail.coordinates',
    defaultMessage: 'Coordinates',
  },
  createdAt: {
    id: 'observationDetail.createdAt',
    defaultMessage: 'Created',
  },
  updatedAt: {
    id: 'observationDetail.updatedAt',
    defaultMessage: 'Updated',
  },
  tags: {
    id: 'observationDetail.tags',
    defaultMessage: 'Tags',
  },
  observationFallback: {
    id: 'observationDetail.fallback',
    defaultMessage: 'Observation',
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

export function ObservationDetailScreen() {
  const intl = useIntl();
  const { observationId } = useParams({ strict: false }) as {
    observationId: string;
  };
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const observationsQuery = useObservations(selectedProjectId);
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

  if (observationsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={150} />
        <Skeleton height={40} width={300} />
        <Skeleton height={200} className="rounded-card" />
      </div>
    );
  }

  const observation = observationsQuery.data?.find(
    (o) => o.localId === observationId,
  );

  if (!observation) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted">
          {intl.formatMessage(messages.notFound)}
        </p>
      </div>
    );
  }

  const tags = observation.tags ?? {};

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

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">
          {tags.category
            ? String(tags.category)
            : intl.formatMessage(messages.observationFallback)}
        </h1>
        <p className="text-text-muted text-sm">
          {intl.formatMessage(messages.createdAt)}:{' '}
          {new Date(observation.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.location)}
          </h3>
          {observation.lat !== undefined && observation.lon !== undefined ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">
                {intl.formatMessage(messages.coordinates)}
              </span>
              <span className="text-sm text-text">
                {observation.lat.toFixed(6)}, {observation.lon.toFixed(6)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-text-muted">
              {intl.formatMessage(messages.noLocation)}
            </span>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.details)}
          </h3>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">
              {intl.formatMessage(messages.updatedAt)}
            </span>
            <span className="text-sm text-text">
              {new Date(observation.updatedAt).toLocaleString()}
            </span>
          </div>
        </Card>
      </div>

      {Object.keys(tags).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.tags)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tags).map(([key, value]) => (
              <span
                key={key}
                className="rounded-pill bg-surface-container-low px-3 py-1 text-xs text-text"
              >
                {key}: {String(value)}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
