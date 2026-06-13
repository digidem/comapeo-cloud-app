import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link, useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
import { FilterSheet } from '@/components/shared/FilterSheet';
import { MediaPreview } from '@/components/shared/MediaPreview';
import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';
import { ObservationFilterBar } from '@/components/shared/ObservationFilterBar';
import { ObservationsMap } from '@/components/shared/ObservationsMap';
import { PaginationControls } from '@/components/shared/PaginationControls';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttachmentsForProject } from '@/hooks/useAttachmentsForProject';
import { useFields } from '@/hooks/useFields';
import { useObservationCategoryMetadata } from '@/hooks/useObservationCategoryMetadata';
import { useObservationFilters } from '@/hooks/useObservationFilters';
import { useObservations } from '@/hooks/useObservations';
import { usePaginatedItems } from '@/hooks/usePaginatedItems';
import { useProjects } from '@/hooks/useProjects';
import { useResponsivePageSize } from '@/hooks/useResponsivePageSize';
import type { Field } from '@/lib/data-layer';
import { useProjectStore } from '@/stores/project-store';
import { useViewModeStore } from '@/stores/view-mode-store';

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
  noObservations: {
    id: 'data.noObservations',
    defaultMessage: 'No observations yet',
  },
  loading: {
    id: 'data.loading',
    defaultMessage: 'Loading...',
  },
  observationFallback: {
    id: 'data.observationFallback',
    defaultMessage: 'Observation',
  },
  observationsError: {
    id: 'data.observationsError',
    defaultMessage: 'Failed to load observations. Please try again.',
  },
  viewGrid: {
    id: 'data.viewGrid',
    defaultMessage: 'Grid view',
  },
  viewMap: {
    id: 'data.viewMap',
    defaultMessage: 'Map view',
  },
  switchToMapView: {
    id: 'data.switchToMapView',
    defaultMessage: 'Switch to map view',
  },
  switchToGridView: {
    id: 'data.switchToGridView',
    defaultMessage: 'Switch to grid view',
  },
  noResults: {
    id: 'data.filters.noResults',
    defaultMessage: 'No observations match your filters',
  },
  filterButton: {
    id: 'data.filterButton',
    defaultMessage: 'Filters',
  },
});

/** Safely extract category label from observation tags */
function getCategoryLabel(obs: {
  tags?: Record<string, unknown>;
}): string | null {
  const raw = obs.tags?.category;
  if (raw === undefined || raw === null) return null;
  const str = String(raw);
  return str === '' ? null : str;
}

export function DataScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const observationsQuery = useObservations(selectedProjectId);
  const attachmentsQuery = useAttachmentsForProject(selectedProjectId);
  const fieldsQuery = useFields(selectedProjectId);
  const viewMode = useViewModeStore((s) => s.viewMode);
  const setViewMode = useViewModeStore((s) => s.setViewMode);

  // Call unconditionally (hooks must not be conditional)
  const obsFilters = useObservationFilters(
    observationsQuery.data ?? [],
    selectedProjectId ?? undefined,
  );

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

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

  const filteredObs = obsFilters.filteredObservations;

  // Responsive page size: 50 on mobile, 60 on desktop
  const pageSize = useResponsivePageSize();

  // Memoize filter deps so usePaginatedItems only resets on actual changes
  const filterDeps = useMemo(
    () => [
      obsFilters.filters.search,
      obsFilters.filters.categories,
      obsFilters.filters.startDate,
      obsFilters.filters.endDate,
      obsFilters.filters.sort,
    ],
    [
      obsFilters.filters.search,
      obsFilters.filters.categories,
      obsFilters.filters.startDate,
      obsFilters.filters.endDate,
      obsFilters.filters.sort,
    ],
  );

  // Pagination — resets to page 1 when filters change
  const {
    paginatedItems: paginatedObservations,
    showingStart,
    showingEnd,
    totalCount,
    hasMore,
    loadMore,
  } = usePaginatedItems(filteredObs, {
    pageSize,
    deps: filterDeps,
  });

  const categoryMetadata = useObservationCategoryMetadata({
    observations: observationsQuery.data ?? [],
    projectLocalId: selectedProjectId,
    projectRemoteId: selectedProject?.remoteId,
    serverUrl: selectedProject?.serverUrl,
  });
  const displayNames = categoryMetadata.displayNamesByObservationId;
  const categoryByObservationId = categoryMetadata.categoryByObservationId;
  const attachments = attachmentsQuery.data;
  const attachmentsByObservationId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof attachments>>();
    for (const attachment of attachments ?? []) {
      const existing = map.get(attachment.observationLocalId) ?? [];
      existing.push(attachment);
      map.set(attachment.observationLocalId, existing);
    }
    return map;
  }, [attachments]);

  const fieldsByKey = useMemo(() => {
    const fields = fieldsQuery.data;
    const map = new Map<string, Field>();
    for (const field of fields ?? []) {
      if (!field.deleted) map.set(field.key, field);
    }
    return map;
  }, [fieldsQuery.data]);

  const { reset: resetFilters } = obsFilters;

  const observationsContent = useMemo(() => {
    const displayObs = paginatedObservations;
    if (displayObs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="text-text-muted text-sm">
            {intl.formatMessage(messages.noResults)}
          </span>
          <button
            type="button"
            className="text-primary text-sm font-medium hover:underline cursor-pointer"
            onClick={resetFilters}
          >
            {intl.formatMessage({
              id: 'data.filters.clear',
              defaultMessage: 'Clear filters',
            })}
          </button>
        </div>
      );
    }
    if (viewMode === 'map') {
      return (
        <div className="mt-4">
          <ObservationsMap
            observations={filteredObs}
            categoryByObservationId={categoryByObservationId}
            onMarkerClick={(observationId) =>
              navigate({
                to: '/data/observations/$observationId',
                params: { observationId },
              })
            }
          />
        </div>
      );
    }
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {displayObs.map((obs) => (
            <Link
              key={obs.localId}
              to="/data/observations/$observationId"
              params={{ observationId: obs.localId }}
              className="no-underline"
            >
              <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  {categoryByObservationId.get(obs.localId) ? (
                    <ObservationCategoryIcon
                      category={categoryByObservationId.get(obs.localId)!}
                      className="h-12 w-12"
                    />
                  ) : (
                    <div className="h-12 w-12" aria-hidden="true" />
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-text truncate">
                      {displayNames.get(obs.localId) ??
                        getCategoryLabel(obs) ??
                        intl.formatMessage(messages.observationFallback)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(obs.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <MediaPreview
                    observationLocalId={obs.localId}
                    tags={obs.tags}
                    attachments={attachmentsByObservationId.get(obs.localId)}
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <PaginationControls
          showingStart={showingStart}
          showingEnd={showingEnd}
          totalCount={totalCount}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </>
    );
  }, [
    filteredObs,
    paginatedObservations,
    showingStart,
    showingEnd,
    totalCount,
    hasMore,
    loadMore,
    viewMode,
    navigate,
    intl,
    resetFilters,
    displayNames,
    categoryByObservationId,
    attachmentsByObservationId,
  ]);

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

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Title */}
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <ExportObservationsButton
          observations={observations}
          projectName={selectedProject?.name}
          disabled={observations.length === 0}
          attachmentsByObservationId={attachmentsByObservationId}
          displayNamesByObservationId={displayNames}
          fieldsByKey={fieldsByKey}
        />
        {viewMode === 'grid' ? (
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-button bg-surface-card text-text-muted hover:bg-surface-container-low hover:text-text transition-colors min-h-[44px]"
            aria-label={intl.formatMessage(messages.switchToMapView)}
            title={intl.formatMessage(messages.viewMap)}
          >
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
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-button bg-surface-card text-text-muted hover:bg-surface-container-low hover:text-text transition-colors min-h-[44px]"
            aria-label={intl.formatMessage(messages.switchToGridView)}
            title={intl.formatMessage(messages.viewGrid)}
          >
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
          </button>
        )}
      </div>

      {/* Observations content */}
      {(() => {
        if (observationsQuery.isError) {
          return (
            <div className="flex items-center justify-center p-8">
              <span className="text-error text-sm">
                {intl.formatMessage(messages.observationsError)}
              </span>
            </div>
          );
        }
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
          <>
            {/* Mobile: filter button that opens bottom sheet */}
            <div className="block md:hidden">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFilterDrawerOpen(true)}
                className="relative"
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
                  className="mr-1.5"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {intl.formatMessage(messages.filterButton)}
                {obsFilters.isFiltering && (
                  <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {filteredObs.length}
                  </span>
                )}
              </Button>

              <FilterSheet
                open={filterDrawerOpen}
                onOpenChange={setFilterDrawerOpen}
                filters={obsFilters.filters}
                availableCategories={obsFilters.availableCategories}
                resultCount={filteredObs.length}
                isFiltering={obsFilters.isFiltering}
                onSearchChange={obsFilters.setSearch}
                onStartDateChange={obsFilters.setStartDate}
                onEndDateChange={obsFilters.setEndDate}
                onCategoryToggle={obsFilters.toggleCategory}
                onCategoriesClear={() => obsFilters.setCategories([])}
                onSortChange={obsFilters.setSort}
                onClear={obsFilters.reset}
              />
            </div>

            {/* Desktop: full filter bar */}
            <div className="hidden md:block">
              <ObservationFilterBar
                filters={obsFilters.filters}
                availableCategories={obsFilters.availableCategories}
                resultCount={filteredObs.length}
                isFiltering={obsFilters.isFiltering}
                onSearchChange={obsFilters.setSearch}
                onStartDateChange={obsFilters.setStartDate}
                onEndDateChange={obsFilters.setEndDate}
                onCategoryToggle={obsFilters.toggleCategory}
                onCategoriesClear={() => obsFilters.setCategories([])}
                onSortChange={obsFilters.setSort}
                onClear={obsFilters.reset}
              />
            </div>
            {observationsContent}
          </>
        );
      })()}
    </div>
  );
}
