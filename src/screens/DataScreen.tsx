import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link, useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { AlertCard } from '@/components/shared/AlertCard';
import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
import { FilterSheet } from '@/components/shared/FilterSheet';
import { MediaPreview } from '@/components/shared/MediaPreview';
import { ObservationFilterBar } from '@/components/shared/ObservationFilterBar';
import { ObservationsMap } from '@/components/shared/ObservationsMap';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAlerts } from '@/hooks/useAlerts';
import { useObservationDisplayNames } from '@/hooks/useObservationDisplayNames';
import { useObservationFilters } from '@/hooks/useObservationFilters';
import { useObservations } from '@/hooks/useObservations';
import { useProjects } from '@/hooks/useProjects';
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
  addAlert: {
    id: 'data.addAlert',
    defaultMessage: 'Add Alert',
  },
  observationsError: {
    id: 'data.observationsError',
    defaultMessage: 'Failed to load observations. Please try again.',
  },
  alertsError: {
    id: 'data.alertsError',
    defaultMessage: 'Failed to load alerts. Please try again.',
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

export function DataScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const observationsQuery = useObservations(selectedProjectId);
  const alertsQuery = useAlerts(selectedProjectId);
  const viewMode = useViewModeStore((s) => s.viewMode);
  const setViewMode = useViewModeStore((s) => s.setViewMode);
  const [activeTab, setActiveTab] = useState('observations');

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

  // Pre-compute observation display names using preset matching
  const displayNames = useObservationDisplayNames(
    filteredObs,
    selectedProjectId,
  );

  const observationsContent = useMemo(() => {
    if (filteredObs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="text-text-muted text-sm">
            {intl.formatMessage(messages.noResults)}
          </span>
          <button
            type="button"
            className="text-primary text-sm font-medium hover:underline cursor-pointer"
            onClick={obsFilters.reset}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {filteredObs.map((obs) => (
          <Link
            key={obs.localId}
            to="/data/observations/$observationId"
            params={{ observationId: obs.localId }}
            className="no-underline"
          >
            <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text">
                  {displayNames.get(obs.localId) ??
                    obs.tags?.category ??
                    intl.formatMessage(messages.observationFallback)}
                </span>
                {obs.lat !== undefined && obs.lon !== undefined && (
                  <span className="text-xs text-text-muted">
                    {obs.lat.toFixed(4)}, {obs.lon.toFixed(4)}
                  </span>
                )}
                <span className="text-xs text-text-muted">
                  {new Date(obs.createdAt).toLocaleDateString()}
                </span>
                <MediaPreview
                  observationLocalId={obs.localId}
                  tags={obs.tags}
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    );
  }, [filteredObs, viewMode, navigate, intl, obsFilters]);

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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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

          <div className="flex items-center gap-2">
            {activeTab === 'observations' && (
              <>
                <ExportObservationsButton
                  observations={observations}
                  projectName={selectedProject?.name}
                  disabled={observations.length === 0}
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
              </>
            )}

            <Link
              to="/data/alerts/new"
              className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-primary-dark transition-colors text-center"
            >
              {intl.formatMessage(messages.addAlert)}
            </Link>
          </div>
        </div>

        <TabsContent value="observations">
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
                    onCategoryChange={obsFilters.setCategory}
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
                    onCategoryChange={obsFilters.setCategory}
                    onSortChange={obsFilters.setSort}
                    onClear={obsFilters.reset}
                  />
                </div>
                {observationsContent}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="alerts">
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
                      <AlertCard alert={alert} />
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
