import type { FeatureCollection } from 'geojson';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { type IntlShape, defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { useAlerts } from '@/hooks/useAlerts';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useObservations } from '@/hooks/useObservations';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
import { BUILT_IN_PRESETS, DEFAULTS } from '@/lib/area-calculator/config';
import type { CalculationParams } from '@/lib/area-calculator/types';
import type { AreaUnit } from '@/lib/area-format';
import { convertArea } from '@/lib/area-format';
import { syncRemoteArchive } from '@/lib/data-layer';
import { exportFeatureCollection } from '@/lib/geojson-export';
import { useAuthStore } from '@/stores/auth-store';

import { AddArchiveServerDialog } from './AddArchiveServerDialog';
import { ArchiveBrowser } from './ArchiveBrowser';
import { ArchiveServerDetail } from './ArchiveServerDetail';
import { AreaMap } from './AreaMap';
import { CalculationSettings } from './CalculationSettings';
import { CoverageSummary } from './CoverageSummary';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ImportDataButton } from './ImportDataButton';
import { MethodSelector } from './MethodSelector';
import { ProjectBannerCard } from './ProjectBannerCard';
import { RecentActivityList } from './RecentActivityList';
import { StatCard } from './StatCard';

// ---- Helpers ----

function formatRelativeTime(ageMs: number, intl: IntlShape): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return intl.formatMessage(messages.timeJustNow);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return intl.formatMessage(messages.timeMinutesAgo, { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return intl.formatMessage(messages.timeHoursAgo, {
      count: hours,
      plural: hours,
    });
  }
  const days = Math.floor(hours / 24);
  return intl.formatMessage(messages.timeDaysAgo, {
    count: days,
    plural: days,
  });
}

// ---- State management ----

interface HomeState {
  selectedProjectId: string | null;
  isCreateDialogOpen: boolean;
  isAddServerDialogOpen: boolean;
  selectedPresetId: string;
  params: CalculationParams;
  activeMethodId: string;
  unit: AreaUnit;
  coverageRefreshKey: number;
  selectedServerId: string | null;
}

type HomeAction =
  | { type: 'SELECT_PROJECT'; id: string }
  | { type: 'OPEN_CREATE_DIALOG' }
  | { type: 'CLOSE_CREATE_DIALOG' }
  | { type: 'PROJECT_CREATED'; id: string }
  | { type: 'SET_PRESET'; presetId: string }
  | { type: 'SET_PARAMS'; params: CalculationParams }
  | { type: 'SET_ACTIVE_METHOD'; methodId: string }
  | { type: 'SET_UNIT'; unit: AreaUnit }
  | { type: 'INCREMENT_COVERAGE_REFRESH' }
  | { type: 'OPEN_ADD_SERVER_DIALOG' }
  | { type: 'CLOSE_ADD_SERVER_DIALOG' }
  | { type: 'SELECT_SERVER'; id: string | null };

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case 'SELECT_PROJECT':
      return {
        ...state,
        selectedProjectId: action.id,
        selectedServerId: null,
      };
    case 'OPEN_CREATE_DIALOG':
      return { ...state, isCreateDialogOpen: true };
    case 'CLOSE_CREATE_DIALOG':
      return { ...state, isCreateDialogOpen: false };
    case 'PROJECT_CREATED':
      return {
        ...state,
        isCreateDialogOpen: false,
        selectedProjectId: action.id,
      };
    case 'SET_PRESET':
      return { ...state, selectedPresetId: action.presetId };
    case 'SET_PARAMS':
      return { ...state, params: action.params };
    case 'SET_ACTIVE_METHOD':
      return { ...state, activeMethodId: action.methodId };
    case 'SET_UNIT':
      return { ...state, unit: action.unit };
    case 'INCREMENT_COVERAGE_REFRESH':
      return { ...state, coverageRefreshKey: state.coverageRefreshKey + 1 };
    case 'OPEN_ADD_SERVER_DIALOG':
      return { ...state, isAddServerDialogOpen: true };
    case 'CLOSE_ADD_SERVER_DIALOG':
      return { ...state, isAddServerDialogOpen: false };
    case 'SELECT_SERVER':
      return { ...state, selectedServerId: action.id };
    default:
      return state;
  }
}

const INITIAL_STATE: HomeState = {
  selectedProjectId: null,
  isCreateDialogOpen: false,
  isAddServerDialogOpen: false,
  selectedPresetId: BUILT_IN_PRESETS[0]?.id ?? 'balanced',
  params: { ...DEFAULTS },
  activeMethodId: 'observed',
  unit: 'ha',
  coverageRefreshKey: 0,
  selectedServerId: null,
};

const PRESET_TO_METHOD: Record<string, string> = {
  footprint: 'observed',
  connectivity: 'connectivity10',
  grid: 'grid',
};

const messages = defineMessages({
  appTitle: {
    id: 'app.title',
    defaultMessage: 'CoMapeo Cloud',
  },
  homeTitle: {
    id: 'home.title',
    defaultMessage: 'Home',
  },
  localMode: {
    id: 'home.localMode',
    defaultMessage: 'Local Mode',
  },
  noProjects: {
    id: 'home.noProjects',
    defaultMessage: 'No projects yet',
  },
  firstProject: {
    id: 'home.noProjects.cta',
    defaultMessage: 'Create your first project',
  },
  noCoordinates: {
    id: 'home.coverage.noCoordinates',
    defaultMessage: 'No mappable coordinates found',
  },
  calculating: {
    id: 'home.coverage.calculating',
    defaultMessage: 'Calculating...',
  },
  untitledProject: {
    id: 'home.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  syncFailed: {
    id: 'home.archive.syncFailed',
    defaultMessage: 'Sync failed',
  },
  monitoredArea: {
    id: 'home.monitoredArea.title',
    defaultMessage: 'Monitored Area',
  },
  activityObservation: {
    id: 'home.activity.observation',
    defaultMessage: 'New observation recorded',
  },
  activityObservationWithCoords: {
    id: 'home.activity.observationWithCoords',
    defaultMessage: 'New geolocated observation',
  },
  activityNoLocation: {
    id: 'home.activity.noLocation',
    defaultMessage: 'No location data',
  },
  activityAlert: {
    id: 'home.activity.alert',
    defaultMessage: 'Alert registered',
  },
  coverageError: {
    id: 'home.coverage.error',
    defaultMessage: 'Coverage calculation failed',
  },
  coverageRetry: {
    id: 'home.coverage.retry',
    defaultMessage: 'Retry calculation',
  },
  statMode: {
    id: 'home.stat.mode',
    defaultMessage: 'Mode',
  },
  statCloudSyncActive: {
    id: 'home.stat.cloudSyncActive',
    defaultMessage: 'Cloud Sync Active',
  },
  statTotalAssets: {
    id: 'home.stat.totalAssets',
    defaultMessage: 'Total Assets',
  },
  statCategories: {
    id: 'home.stat.categories',
    defaultMessage: 'Categories',
  },
  statActiveAlerts: {
    id: 'home.stat.activeAlerts',
    defaultMessage: 'Active Alerts',
  },
  timeJustNow: {
    id: 'home.time.justNow',
    defaultMessage: 'JUST NOW',
  },
  timeMinutesAgo: {
    id: 'home.time.minutesAgo',
    defaultMessage: '{count} MIN AGO',
  },
  timeHoursAgo: {
    id: 'home.time.hoursAgo',
    defaultMessage: '{count} HR{plural, plural, one {} other {S}} AGO',
  },
  timeDaysAgo: {
    id: 'home.time.daysAgo',
    defaultMessage: '{count} DAY{plural, plural, one {} other {S}} AGO',
  },
  archiveSectionTitle: {
    id: 'home.archive.sectionTitle',
    defaultMessage: 'Archive Servers',
  },
  archiveAddServer: {
    id: 'home.archive.addServer',
    defaultMessage: 'Add Server',
  },
  activityAlertDesc: {
    id: 'home.activity.alertDesc',
    defaultMessage: 'New alert event detected in project area.',
  },
});

// ---- Component ----

function HomeScreen() {
  const [state, dispatch] = useReducer(homeReducer, INITIAL_STATE);
  const intl = useIntl();
  const [now, setNow] = useState(() => Date.now());

  // Refresh relative timestamps every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const queryClient = useQueryClient();
  const projectsQuery = useProjects();
  const coverage = useProjectCoverage(
    state.selectedProjectId,
    state.params,
    state.coverageRefreshKey,
  );
  const observationsQuery = useObservations(state.selectedProjectId);
  const alertsQuery = useAlerts(state.selectedProjectId);
  const archiveStatus = useArchiveStatus();
  const servers = useAuthStore((s) => s.servers);
  const removeServer = useAuthStore((s) => s.removeServer);

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );
  const selectedProject = projects.find(
    (p) => p.localId === state.selectedProjectId,
  );

  const observations = useMemo(
    () => observationsQuery.data ?? [],
    [observationsQuery.data],
  );

  const alerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);

  // Derive unique tag categories from observations
  const categoryCount = useMemo(() => {
    const tagKeys = new Set<string>();
    for (const obs of observations) {
      if (obs.tags) {
        for (const key of Object.keys(obs.tags)) {
          tagKeys.add(key);
        }
      }
    }
    return tagKeys.size;
  }, [observations]);

  // Build recent activity from real observations and alerts
  const recentActivities = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: string;
      type: 'record' | 'map' | 'sync';
      _sortKey: number;
    }> = [];

    for (const obs of observations) {
      const createdMs = new Date(obs.createdAt).getTime();
      const ageMs = now - createdMs;
      const hasCoords = obs.lat !== undefined && obs.lon !== undefined;
      items.push({
        id: obs.localId,
        title: hasCoords
          ? intl.formatMessage(messages.activityObservationWithCoords)
          : intl.formatMessage(messages.activityObservation),
        description: hasCoords
          ? `${obs.lat!.toFixed(4)}, ${obs.lon!.toFixed(4)}`
          : intl.formatMessage(messages.activityNoLocation),
        timestamp: formatRelativeTime(ageMs, intl),
        type: 'record',
        _sortKey: createdMs,
      });
    }

    for (const alert of alerts) {
      const createdMs = new Date(alert.createdAt).getTime();
      const ageMs = now - createdMs;
      items.push({
        id: alert.localId,
        title: intl.formatMessage(messages.activityAlert),
        description: intl.formatMessage(messages.activityAlertDesc),
        timestamp: formatRelativeTime(ageMs, intl),
        type: 'sync',
        _sortKey: createdMs,
      });
    }

    // Sort by most recent first, keep top 10
    items.sort((a, b) => b._sortKey - a._sortKey);

    return items.slice(0, 10).map(({ _sortKey: _, ...rest }) => rest);
  }, [observations, alerts, intl, now]);

  // Derive territory area from coverage results
  const territoryArea = useMemo(() => {
    const activeResult = coverage.results.find(
      (r) => r.methodId === state.activeMethodId,
    );
    if (activeResult?.result?.areaM2) {
      return convertArea(activeResult.result.areaM2, state.unit);
    }
    return '0 ha';
  }, [coverage.results, state.activeMethodId, state.unit]);

  const completedMapLayers = useMemo(() => {
    const mapLayers: Array<{
      id: string;
      featureCollection: FeatureCollection;
      isActive: boolean;
    }> = [];

    for (const item of coverage.results) {
      if (item.result) {
        mapLayers.push({
          id: item.methodId,
          featureCollection: item.result
            .previewFeatureCollection as FeatureCollection,
          isActive: item.methodId === state.activeMethodId,
        });
      }
    }

    return mapLayers;
  }, [coverage.results, state.activeMethodId]);

  // Auto-select the last updated project when projects load and none is selected
  useEffect(() => {
    if (!state.selectedProjectId && projects.length > 0) {
      const sorted = [...projects].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      dispatch({ type: 'SELECT_PROJECT', id: sorted[0]!.localId });
    }
  }, [state.selectedProjectId, projects]);

  const handleOpenCreateDialog = useCallback(
    () => dispatch({ type: 'OPEN_CREATE_DIALOG' }),
    [],
  );

  const handleIncrementRefresh = useCallback(
    () => dispatch({ type: 'INCREMENT_COVERAGE_REFRESH' }),
    [],
  );

  function handleSync(serverId: string) {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;

    // UX guard: skip if already syncing (the real lock is in sync.ts)
    if (server.status === 'syncing') return;

    void syncRemoteArchive(serverId, {
      baseUrl: server.baseUrl,
      token: server.token,
    }).catch(() => {
      /* sync errors are surfaced via store status updates */
    });
  }

  function handleExport(methodId: string) {
    const result = coverage.results.find((r) => r.methodId === methodId);
    if (!result?.result) return;
    exportFeatureCollection(
      result.result.featureCollection,
      `${methodId}.geojson`,
    );
  }

  function handlePresetChange(presetId: string) {
    dispatch({ type: 'SET_PRESET', presetId });

    const matchingMethodId = PRESET_TO_METHOD[presetId];
    if (matchingMethodId) {
      dispatch({ type: 'SET_ACTIVE_METHOD', methodId: matchingMethodId });
    }
  }

  // ---- Shell slot: inject topbar + secondary sidebar into layout's AppShell ----

  const topbarWorkspaceName =
    selectedProject?.name ??
    (selectedProject
      ? intl.formatMessage(messages.untitledProject)
      : intl.formatMessage(messages.localMode));

  const secondaryContent = useMemo(
    () => (
      <div className="flex flex-col gap-4 p-4">
        <ArchiveBrowser
          selectedProjectId={state.selectedProjectId}
          onSelect={(id) => dispatch({ type: 'SELECT_PROJECT', id })}
          onCreateNew={handleOpenCreateDialog}
          onAddServer={() => dispatch({ type: 'OPEN_ADD_SERVER_DIALOG' })}
        />

        {state.selectedProjectId && (
          <ImportDataButton
            projectLocalId={state.selectedProjectId}
            onImportComplete={handleIncrementRefresh}
          />
        )}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projects,
      state.selectedProjectId,
      projectsQuery.isLoading,
      handleOpenCreateDialog,
      handleIncrementRefresh,
    ],
  );

  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName,
      topbarModeLabel: intl.formatMessage(messages.homeTitle),
      secondaryContent,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topbarWorkspaceName, secondaryContent],
  );

  useShellSlot(shellSlot);

  // ---- Main content area ----

  // When an archive server is selected, show its detail view
  const selectedArchiveServer = archiveStatus.servers.find(
    (s) => s.id === state.selectedServerId,
  );

  if (selectedArchiveServer) {
    return (
      <>
        <ArchiveServerDetail
          server={selectedArchiveServer}
          onSync={handleSync}
          onRemove={(id) => {
            void removeServer(id);
            dispatch({ type: 'SELECT_SERVER', id: null });
          }}
        />

        <CreateProjectDialog
          isOpen={state.isCreateDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_CREATE_DIALOG' })}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            dispatch({ type: 'PROJECT_CREATED', id });
          }}
        />

        <AddArchiveServerDialog
          isOpen={state.isAddServerDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' })}
          onAdded={(serverId) => {
            dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' });
            const server = useAuthStore
              .getState()
              .servers.find((s) => s.id === serverId);
            if (server) {
              void syncRemoteArchive(serverId, {
                baseUrl: server.baseUrl,
                token: server.token,
              }).then(() => {
                void queryClient.invalidateQueries({ queryKey: ['projects'] });
                void queryClient.invalidateQueries({
                  queryKey: ['observations'],
                });
                void queryClient.invalidateQueries({ queryKey: ['alerts'] });
              });
            }
          }}
        />
      </>
    );
  }

  if (!state.selectedProjectId) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-3 py-12 sm:py-16 lg:py-20 text-center">
          <p className="text-text-muted text-sm">
            {intl.formatMessage(messages.noProjects)}
          </p>
          <Button variant="primary" size="sm" onClick={handleOpenCreateDialog}>
            {intl.formatMessage(messages.firstProject)}
          </Button>
        </div>

        <CreateProjectDialog
          isOpen={state.isCreateDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_CREATE_DIALOG' })}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            dispatch({ type: 'PROJECT_CREATED', id });
          }}
        />

        <AddArchiveServerDialog
          isOpen={state.isAddServerDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' })}
          onAdded={(serverId) => {
            dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' });
            const server = useAuthStore
              .getState()
              .servers.find((s) => s.id === serverId);
            if (server) {
              void syncRemoteArchive(serverId, {
                baseUrl: server.baseUrl,
                token: server.token,
              }).then(() => {
                void queryClient.invalidateQueries({ queryKey: ['projects'] });
                void queryClient.invalidateQueries({
                  queryKey: ['observations'],
                });
                void queryClient.invalidateQueries({ queryKey: ['alerts'] });
              });
            }
          }}
        />
      </>
    );
  }

  const hasMethodResults = coverage.results.length > 0;
  const hasCompletedResult = coverage.results.some((r) => r.result);
  const showCoverageError =
    coverage.error !== null && !coverage.isCalculating && !hasMethodResults;
  const showNoCoordinates =
    !coverage.isCalculating && !hasMethodResults && coverage.error === null;

  if (showCoverageError) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-3 py-12 sm:py-16 lg:py-20 text-center">
          <p className="text-error text-sm" role="alert">
            {intl.formatMessage(messages.coverageError)}
          </p>
          <Button variant="primary" size="sm" onClick={handleIncrementRefresh}>
            {intl.formatMessage(messages.coverageRetry)}
          </Button>
        </div>

        <CreateProjectDialog
          isOpen={state.isCreateDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_CREATE_DIALOG' })}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            dispatch({ type: 'PROJECT_CREATED', id });
          }}
        />

        <AddArchiveServerDialog
          isOpen={state.isAddServerDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' })}
          onAdded={(serverId) => {
            dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' });
            const server = useAuthStore
              .getState()
              .servers.find((s) => s.id === serverId);
            if (server) {
              void syncRemoteArchive(serverId, {
                baseUrl: server.baseUrl,
                token: server.token,
              }).then(() => {
                void queryClient.invalidateQueries({ queryKey: ['projects'] });
                void queryClient.invalidateQueries({
                  queryKey: ['observations'],
                });
                void queryClient.invalidateQueries({ queryKey: ['alerts'] });
              });
            }
          }}
        />
      </>
    );
  }

  if (showNoCoordinates) {
    return (
      <>
        <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
          {selectedProject && (
            <ProjectBannerCard
              projectName={
                selectedProject.name ??
                intl.formatMessage(messages.untitledProject)
              }
              areaSize="0 ha"
              teamMembersCount={0}
            />
          )}
          <p className="text-text-muted text-sm">
            {intl.formatMessage(messages.noCoordinates)}
          </p>
        </div>

        <CreateProjectDialog
          isOpen={state.isCreateDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_CREATE_DIALOG' })}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            dispatch({ type: 'PROJECT_CREATED', id });
          }}
        />

        <AddArchiveServerDialog
          isOpen={state.isAddServerDialogOpen}
          onClose={() => dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' })}
          onAdded={(serverId) => {
            dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' });
            const server = useAuthStore
              .getState()
              .servers.find((s) => s.id === serverId);
            if (server) {
              void syncRemoteArchive(serverId, {
                baseUrl: server.baseUrl,
                token: server.token,
              }).then(() => {
                void queryClient.invalidateQueries({ queryKey: ['projects'] });
                void queryClient.invalidateQueries({
                  queryKey: ['observations'],
                });
                void queryClient.invalidateQueries({ queryKey: ['alerts'] });
              });
            }
          }}
        />
      </>
    );
  }

  const observationCount = observations.length;

  return (
    <>
      <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
        {/* Top Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title={intl.formatMessage(messages.statMode)}
            value={intl.formatMessage(messages.statCloudSyncActive)}
            valueColor="text-info"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
              </svg>
            }
          />
          <StatCard
            title={intl.formatMessage(messages.statTotalAssets)}
            value={observationCount.toLocaleString()}
          />
          <StatCard
            title={intl.formatMessage(messages.statCategories)}
            value={categoryCount}
          />
          <StatCard
            title={intl.formatMessage(messages.statActiveAlerts)}
            value={alerts.length}
            valueColor="text-error"
          />
        </div>

        {/* Project Banner */}
        {selectedProject && (
          <ProjectBannerCard
            projectName={
              selectedProject.name ??
              intl.formatMessage(messages.untitledProject)
            }
            areaSize={territoryArea}
            lastSync={(() => {
              const synced = archiveStatus.servers.find((s) => s.lastSyncedAt);
              if (!synced?.lastSyncedAt) return undefined;
              return formatRelativeTime(
                now - new Date(synced.lastSyncedAt).getTime(),
                intl,
              );
            })()}
            teamMembersCount={archiveStatus.servers.length || 1}
          />
        )}

        <div className="flex flex-col gap-6">
          <RecentActivityList activities={recentActivities} />
        </div>

        {/* Area Calculator Section */}
        <div className="mt-8 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-text">
            {intl.formatMessage(messages.monitoredArea)}
          </h2>

          <div className="relative">
            <AreaMap
              featureCollection={
                coverage.results.find(
                  (r) => r.methodId === state.activeMethodId,
                )?.result?.featureCollection as FeatureCollection | undefined
              }
              layers={completedMapLayers}
              activeMethodId={state.activeMethodId}
            >
              {coverage.isCalculating && (
                <div role="status" aria-live="polite" className="sr-only">
                  {intl.formatMessage(messages.calculating)}
                </div>
              )}

              <MethodSelector
                results={coverage.results}
                activeMethodId={state.activeMethodId}
                onActivate={(methodId) =>
                  dispatch({ type: 'SET_ACTIVE_METHOD', methodId })
                }
                onExport={() => handleExport(state.activeMethodId)}
              />

              <CoverageSummary
                activeMethodId={state.activeMethodId}
                results={coverage.results}
                isCalculating={coverage.isCalculating}
                unit={state.unit}
                onUnitChange={(unit) => dispatch({ type: 'SET_UNIT', unit })}
              />

              {hasCompletedResult && (
                <CalculationSettings
                  presets={BUILT_IN_PRESETS}
                  selectedPresetId={state.selectedPresetId}
                  params={state.params}
                  onPresetChange={handlePresetChange}
                  onParamsChange={(params) =>
                    dispatch({ type: 'SET_PARAMS', params })
                  }
                />
              )}
            </AreaMap>
          </div>
        </div>
      </div>

      <CreateProjectDialog
        isOpen={state.isCreateDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_CREATE_DIALOG' })}
        onCreated={(id) => {
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          dispatch({ type: 'PROJECT_CREATED', id });
        }}
      />

      <AddArchiveServerDialog
        isOpen={state.isAddServerDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' })}
        onAdded={(serverId) => {
          dispatch({ type: 'CLOSE_ADD_SERVER_DIALOG' });
          const server = useAuthStore
            .getState()
            .servers.find((s) => s.id === serverId);
          if (server) {
            void syncRemoteArchive(serverId, {
              baseUrl: server.baseUrl,
              token: server.token,
            }).then(() => {
              void queryClient.invalidateQueries({ queryKey: ['projects'] });
              void queryClient.invalidateQueries({
                queryKey: ['observations'],
              });
              void queryClient.invalidateQueries({ queryKey: ['alerts'] });
            });
          }
        }}
      />
    </>
  );
}

export { HomeScreen };
