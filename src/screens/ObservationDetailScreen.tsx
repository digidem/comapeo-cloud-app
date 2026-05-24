import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Marker } from 'react-map-gl/maplibre';

import { Link, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { MapContainer } from '@/components/shared/MapContainer';
import { AuthImg } from '@/components/shared/auth-img';
import { MediaLightbox } from '@/components/shared/media-lightbox';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useObservationDisplayNames } from '@/hooks/useObservationDisplayNames';
import { useObservations } from '@/hooks/useObservations';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  errorLoading: {
    id: 'observationDetail.errorLoading',
    defaultMessage: 'Failed to load observation',
  },
  tryAgain: {
    id: 'observationDetail.tryAgain',
    defaultMessage: 'Please try again later.',
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
  mediaGallery: {
    id: 'observationDetail.mediaGallery',
    defaultMessage: 'Media',
  },
});

/** Internal metadata tags that should be filtered from the tags display */
const INTERNAL_TAGS = new Set([
  'photoUrls',
  'photoCount',
  'audioCount',
  'trackCount',
]);

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

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  if (observationsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-error font-semibold">
          {intl.formatMessage(messages.errorLoading)}
        </p>
        <p className="text-sm text-text-muted">
          {observationsQuery.error?.message ??
            intl.formatMessage(messages.tryAgain)}
        </p>
      </div>
    );
  }

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

  // Compute display name using preset matching
  const displayNames = useObservationDisplayNames(
    observation ? [observation] : [],
    selectedProjectId,
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
  const photoList =
    tags.photoUrls === undefined
      ? []
      : String(tags.photoUrls)
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean);

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Link
          to="/data"
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
          {intl.formatMessage(messages.dataLabel)}
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">
          {displayNames.get(observation.localId) ??
            tags.category ??
            intl.formatMessage(messages.observationFallback)}
        </h1>
        <p className="text-text-muted text-sm">
          {intl.formatMessage(messages.createdAt)}:{' '}
          {new Date(observation.createdAt).toLocaleString()}
        </p>
      </div>

      {photoList.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.mediaGallery)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {photoList.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="h-20 w-20 overflow-hidden rounded-md bg-surface-container-low transition-all hover:ring-2 hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-safe:hover:scale-105 motion-safe:active:scale-95"
                aria-label={`Photo ${index + 1}`}
              >
                <AuthImg
                  src={url}
                  alt={`Photo ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>

          {lightboxIndex !== null && (
            <MediaLightbox
              images={photoList}
              currentIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onNavigate={setLightboxIndex}
            />
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-0 overflow-hidden">
          {observation.lat !== undefined && observation.lon !== undefined ? (
            <>
              {/* Mini-map showing observation location */}
              <div className="h-48 w-full">
                <MapContainer
                  initialViewState={{
                    longitude: observation.lon,
                    latitude: observation.lat,
                    zoom: 13,
                  }}
                  interactive={true}
                  showBasemapSwitcher={false}
                  className="h-full w-full"
                >
                  <Marker
                    longitude={observation.lon}
                    latitude={observation.lat}
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
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.coordinates)}:{' '}
                  <span className="text-text font-mono">
                    {observation.lat.toFixed(6)}, {observation.lon.toFixed(6)}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-text-muted"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-sm text-text-muted">
                {intl.formatMessage(messages.noLocation)}
              </span>
            </div>
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

      {Object.entries(tags).filter(([key]) => !INTERNAL_TAGS.has(key)).length >
        0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-2">
            {intl.formatMessage(messages.tags)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tags)
              .filter(([key]) => !INTERNAL_TAGS.has(key))
              .map(([key, value]) => (
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
