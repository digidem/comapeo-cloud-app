import type { FeatureCollection } from 'geojson';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import { useProjects } from '@/hooks/useProjects';
import { BUILT_IN_PRESETS, DEFAULTS } from '@/lib/area-calculator/config';
import type { CalculationParams } from '@/lib/area-calculator/types';
import type { AreaUnit } from '@/lib/area-format';
import { syncRemoteArchive } from '@/lib/data-layer';
import { exportFeatureCollection } from '@/lib/geojson-export';
import { useAuthStore } from '@/stores/auth-store';

import { ArchiveStatusCard } from './ArchiveStatusCard';
import { AreaMap } from './AreaMap';
import { CalculationSettings } from './CalculationSettings';
import { CoverageSummary } from './CoverageSummary';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ImportDataButton } from './ImportDataButton';
import { MethodSelector } from './MethodSelector';
import { ProjectBannerCard } from './ProjectBannerCard';
import { ProjectList } from './ProjectList';
import { RecentActivityList } from './RecentActivityList';
import { StatCard } from './StatCard';

const MOCK_ACTIVITIES = [
  {
    id: '1',
    title: 'New record uploaded by Maria',
    description: 'Sighting of illegal logging activity near sector 4.',
    timestamp: '10 MIN AGO',
    type: 'record' as const,
  },
  {
    id: '2',
    title: 'Map boundary updated',
    description: 'Northern perimeter adjusted based on recent GPS track.',
    timestamp: '2 HRS AGO',
    type: 'map' as const,
  },
];

// ---- State management ----

interface HomeState {
  selectedProjectId: string | null;
  isCreateDialogOpen: boolean;
  selectedPresetId: string;
  params: CalculationParams;
  activeMethodId: string;
  unit: AreaUnit;
  coverageRefreshKey: number;
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
  | { type: 'INCREMENT_COVERAGE_REFRESH' };

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case 'SELECT_PROJECT':
      return { ...state, selectedProjectId: action.id };
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
    default:
      return state;
  }
}

const INITIAL_STATE: HomeState = {
  selectedProjectId: null,
  isCreateDialogOpen: false,
  selectedPresetId: BUILT_IN_PRESETS[0]?.id ?? 'balanced',
  params: { ...DEFAULTS },
  activeMethodId: 'observed',
  unit: 'ha',
  coverageRefreshKey: 0,
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
  settingsTitle: {
    id: 'settings.title',
    defaultMessage: 'Settings',
  },
  localMode: {
    id: 'home.localMode',
    defaultMessage: 'Local Mode',
  },
  newProject: {
    id: 'home.newProject',
    defaultMessage: 'New Project',
  },
  newProjectTopbarAria: {
    id: 'home.newProject.topbarAria',
    defaultMessage: 'Create new project from topbar',
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
});

// ---- Component ----

function HomeScreen() {
  const [state, dispatch] = useReducer(homeReducer, INITIAL_STATE);
  const intl = useIntl();

  const queryClient = useQueryClient();
  const projectsQuery = useProjects();
  const coverage = useProjectCoverage(
    state.selectedProjectId,
    state.params,
    state.coverageRefreshKey,
  );
  const archiveStatus = useArchiveStatus();
  const updateServerStatus = useAuthStore((s) => s.updateServerStatus);
  const servers = useAuthStore((s) => s.servers);

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );
  const selectedProject = projects.find(
    (p) => p.localId === state.selectedProjectId,
  );

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

    void updateServerStatus(serverId, 'syncing');
    syncRemoteArchive(serverId, {
      baseUrl: server.baseUrl,
      token: server.token,
    }).then(
      (result) => {
        void updateServerStatus(
          serverId,
          result.success ? 'connected' : 'error',
          result.error,
        );
      },
      (err: unknown) => {
        void updateServerStatus(
          serverId,
          'error',
          err instanceof Error
            ? err.message
            : intl.formatMessage(messages.syncFailed),
        );
      },
    );
  }

  function handleExport(methodId: string) {
    const result = coverage.results.find((r) => r.methodId === methodId);
    if (!result?.result) return;
    exportFeatureCollection(
      result.result.featureCollection,
      `${methodId}.geojson`,
    );
  }

  // ---- Shell slot: inject topbar + secondary sidebar into layout's AppShell ----

  const topbarWorkspaceName =
    selectedProject?.name ??
    (selectedProject
      ? intl.formatMessage(messages.untitledProject)
      : intl.formatMessage(messages.localMode));

  const topbarActions = useMemo(
    () => (
      <Button
        variant="primary"
        size="sm"
        aria-label={intl.formatMessage(messages.newProjectTopbarAria)}
        onClick={handleOpenCreateDialog}
      >
        {intl.formatMessage(messages.newProject)}
      </Button>
    ),
    // intl reference is stable within a session; handleOpenCreateDialog is stable (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleOpenCreateDialog],
  );

  const secondaryContent = useMemo(
    () => (
      <div className="flex flex-col gap-4 p-4">
        <ProjectList
          projects={projects}
          selectedProjectId={state.selectedProjectId}
          onSelect={(id) => dispatch({ type: 'SELECT_PROJECT', id })}
          onCreateNew={handleOpenCreateDialog}
          isLoading={projectsQuery.isLoading}
        />

        {state.selectedProjectId && (
          <ImportDataButton
            projectLocalId={state.selectedProjectId}
            onImportComplete={handleIncrementRefresh}
          />
        )}

        {archiveStatus.servers.length > 0 && (
          <div className="flex flex-col gap-3">
            {archiveStatus.servers.map((server) => (
              <ArchiveStatusCard
                key={server.id}
                server={server}
                onSync={handleSync}
              />
            ))}
          </div>
        )}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projects,
      state.selectedProjectId,
      projectsQuery.isLoading,
      archiveStatus.servers,
      handleOpenCreateDialog,
      handleIncrementRefresh,
    ],
  );

  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName,
      topbarModeLabel: intl.formatMessage(messages.homeTitle),
      topbarActions,
      secondaryContent,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topbarWorkspaceName, topbarActions, secondaryContent],
  );

  useShellSlot(shellSlot);

  // ---- Main content area ----
  if (!state.selectedProjectId) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
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
      </>
    );
  }

  const hasMethodResults = coverage.results.length > 0;
  const hasCompletedResult = coverage.results.some((r) => r.result);
  const showNoCoordinates =
    !coverage.isCalculating && !hasMethodResults && coverage.error === null;

  if (showNoCoordinates) {
    return (
      <>
        <div className="flex flex-col gap-6 p-6">
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
      </>
    );
  }

  const observationCount = coverage.results.reduce((acc, r) => {
    if (r.result?.metadata?.pointCount !== undefined) {
      return Math.max(acc, Number(r.result.metadata.pointCount));
    }
    return acc;
  }, 0);

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        {/* Top Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Mode"
            value="Cloud Sync Active"
            valueColor="text-blue-600"
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
            title="Total Assets"
            value={observationCount.toLocaleString()}
          />
          <StatCard title="Categories" value="18" />
          <StatCard title="Active Alerts" value="3" valueColor="text-red-500" />
        </div>

        {/* Project Banner */}
        {selectedProject && (
          <ProjectBannerCard
            projectName={
              selectedProject.name ??
              intl.formatMessage(messages.untitledProject)
            }
            areaSize="45,000 ha"
            lastSync="2 hours ago"
            teamMembersCount={8}
          />
        )}

        <div className="flex flex-col gap-6">
          <RecentActivityList activities={MOCK_ACTIVITIES} />
        </div>

        {/* Area Calculator Section */}
        <div className="mt-8 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-gray-900">Area Calculator</h2>

          <div className="relative">
            <AreaMap
              featureCollection={
                coverage.results.find(
                  (r) => r.methodId === state.activeMethodId,
                )?.result?.featureCollection as FeatureCollection | undefined
              }
            >
              <div className="flex flex-col gap-4 bg-white/95 backdrop-blur-md p-5 rounded-card border border-border/20 shadow-xl">
                {coverage.isCalculating && (
                  <div role="status" aria-live="polite" className="sr-only">
                    {intl.formatMessage(messages.calculating)}
                  </div>
                )}

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
                    onPresetChange={(presetId) =>
                      dispatch({ type: 'SET_PRESET', presetId })
                    }
                    onParamsChange={(params) =>
                      dispatch({ type: 'SET_PARAMS', params })
                    }
                  />
                )}
              </div>
            </AreaMap>

            <div className="absolute top-4 left-4 z-20">
              <MethodSelector
                results={coverage.results}
                activeMethodId={state.activeMethodId}
                onActivate={(methodId) =>
                  dispatch({ type: 'SET_ACTIVE_METHOD', methodId })
                }
                onExport={() => handleExport(state.activeMethodId)}
              />
            </div>
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
    </>
  );
}

export { HomeScreen };
