import { useReducer } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { AppShell } from '@/components/layout/app-shell';
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
import { CalculationSettings } from './CalculationSettings';
import { CoverageSummary } from './CoverageSummary';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ImportDataButton } from './ImportDataButton';
import { MethodComparisonGrid } from './MethodComparisonGrid';
import { ProjectList } from './ProjectList';
import { ProjectOverviewHeader } from './ProjectOverviewHeader';

// ---- Nav icons ----

function HomeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---- State management ----

interface HomeState {
  selectedProjectId: string | null;
  isCreateDialogOpen: boolean;
  selectedPresetId: string;
  params: CalculationParams;
  activeMethodId: string;
  unit: AreaUnit;
}

type HomeAction =
  | { type: 'SELECT_PROJECT'; id: string }
  | { type: 'OPEN_CREATE_DIALOG' }
  | { type: 'CLOSE_CREATE_DIALOG' }
  | { type: 'PROJECT_CREATED'; id: string }
  | { type: 'SET_PRESET'; presetId: string }
  | { type: 'SET_PARAMS'; params: CalculationParams }
  | { type: 'SET_ACTIVE_METHOD'; methodId: string };

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
};

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: <HomeIcon /> },
  { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

// ---- Component ----

function HomeScreen() {
  const [state, dispatch] = useReducer(homeReducer, INITIAL_STATE);

  const queryClient = useQueryClient();
  const projectsQuery = useProjects();
  const coverage = useProjectCoverage(state.selectedProjectId, state.params);
  const archiveStatus = useArchiveStatus();
  const updateServerStatus = useAuthStore((s) => s.updateServerStatus);
  const servers = useAuthStore((s) => s.servers);

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find(
    (p) => p.localId === state.selectedProjectId,
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
          err instanceof Error ? err.message : 'Sync failed',
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

  // ---- Secondary sidebar content ----
  const secondaryContent = (
    <div className="flex flex-col gap-4 p-4">
      <ProjectList
        projects={projects}
        selectedProjectId={state.selectedProjectId}
        onSelect={(id) => dispatch({ type: 'SELECT_PROJECT', id })}
        onCreateNew={() => dispatch({ type: 'OPEN_CREATE_DIALOG' })}
        isLoading={projectsQuery.isLoading}
      />

      {state.selectedProjectId && (
        <ImportDataButton projectLocalId={state.selectedProjectId} />
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
  );

  // ---- Main content area ----
  function renderMainContent() {
    if (!state.selectedProjectId) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
          <p className="text-text-muted text-sm">No projects yet.</p>
          <p className="text-text-muted text-sm">Create your first project.</p>
        </div>
      );
    }

    const hasResults = coverage.results.length > 0;
    const showNoCoordinates =
      !coverage.isCalculating && !hasResults && coverage.error === null;

    if (showNoCoordinates) {
      return (
        <div className="flex flex-col gap-6">
          {selectedProject && (
            <ProjectOverviewHeader
              projectName={selectedProject.name ?? 'Untitled Project'}
              observationCount={0}
              sourceType="local"
            />
          )}
          <p className="text-text-muted text-sm">
            No mappable coordinates found
          </p>
        </div>
      );
    }

    const activeResult = coverage.results.find(
      (r) => r.methodId === state.activeMethodId,
    );
    const observationCount = coverage.results.reduce((acc, r) => {
      if (r.result?.metadata?.pointCount !== undefined) {
        return Math.max(acc, Number(r.result.metadata.pointCount));
      }
      return acc;
    }, 0);

    return (
      <div className="flex flex-col gap-6">
        {selectedProject && (
          <ProjectOverviewHeader
            projectName={selectedProject.name ?? 'Untitled Project'}
            observationCount={observationCount}
            sourceType="local"
          />
        )}

        <CoverageSummary
          activeMethodId={state.activeMethodId}
          results={coverage.results}
          isCalculating={coverage.isCalculating}
        />

        <MethodComparisonGrid
          results={coverage.results}
          activeMethodId={state.activeMethodId}
          isCalculating={coverage.isCalculating}
          unit={state.unit}
          onActivate={(methodId) =>
            dispatch({ type: 'SET_ACTIVE_METHOD', methodId })
          }
          onExport={handleExport}
        />

        {activeResult?.result && (
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
    );
  }

  return (
    <>
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={NAV_ITEMS}
        activeNavPath="/"
        secondaryContent={secondaryContent}
      >
        {renderMainContent()}
      </AppShell>

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
