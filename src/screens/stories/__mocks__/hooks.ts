/**
 * Mock hooks for Storybook.
 *
 * Provides controlled data for TanStack Query hooks used by screens.
 * Import these and pass them as story parameters via module aliasing.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  type StorybookDataMode,
  useStorybookDataStore,
} from '../storybook-loading-control';
import { useArchiveStore, useAuthStore } from './stores';

// ---------------------------------------------------------------------------
// Types matching our actual data shapes
// ---------------------------------------------------------------------------

interface Observation {
  localId: string;
  docId: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  lat?: number;
  lon?: number;
  tags: Record<string, string>;
}

interface Alert {
  localId: string;
  docId: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  detectionDateStart?: string;
  detectionDateEnd?: string;
  metadata?: Record<string, unknown>;
}

interface Project {
  localId: string;
  projectId: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const MOCK_PROJECTS: Project[] = [
  { localId: 'proj-1', projectId: 'abc-123', name: 'Amazon Rainforest' },
  { localId: 'proj-2', projectId: 'def-456', name: 'Cerrado Savanna' },
];

export const MOCK_OBSERVATIONS: Observation[] = [
  {
    localId: 'obs-1',
    docId: 'doc-1',
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T10:30:00Z',
    deleted: false,
    lat: -3.4653,
    lon: -62.2159,
    tags: {
      category: 'forest',
      note: 'Canopy cover >80%',
      photoCount: '3',
      audioCount: '1',
    },
  },
  {
    localId: 'obs-2',
    docId: 'doc-2',
    createdAt: '2025-02-20T14:15:00Z',
    updatedAt: '2025-02-20T14:15:00Z',
    deleted: false,
    lat: -3.47,
    lon: -62.22,
    tags: { category: 'water', note: 'River level normal' },
  },
  {
    localId: 'obs-3',
    docId: 'doc-3',
    createdAt: '2025-03-10T08:45:00Z',
    updatedAt: '2025-03-12T16:00:00Z',
    deleted: false,
    lat: -3.48,
    lon: -62.23,
    tags: { category: 'wildlife', note: 'Jaguar tracks', photoCount: '5' },
  },
];

export const MOCK_ALERTS: Alert[] = [
  {
    localId: 'alert-1',
    docId: 'alert-doc-1',
    createdAt: '2025-01-20T12:00:00Z',
    updatedAt: '2025-01-20T12:00:00Z',
    deleted: false,
    detectionDateStart: '2025-01-18T00:00:00Z',
    detectionDateEnd: '2025-01-19T23:59:59Z',
    metadata: { source: 'sentinel-2', confidence: 'high' },
  },
  {
    localId: 'alert-2',
    docId: 'alert-doc-2',
    createdAt: '2025-02-15T09:00:00Z',
    updatedAt: '2025-02-15T09:00:00Z',
    deleted: false,
    detectionDateStart: '2025-02-13T00:00:00Z',
    detectionDateEnd: '2025-02-14T23:59:59Z',
  },
];

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

/**
 * Resolve a query based on the current Storybook data mode (set by the
 * DataScreen decorator). Returns either the fixture data, a never-resolving
 * promise (loading), a rejected promise (error), or an empty array (empty).
 *
 * The query key includes a per-hook segment so `useObservations('proj-1')`
 * and `useAlerts('proj-1')` don't collide in the TanStack Query cache. A
 * shared `['dataMode', projectLocalId]` key would deduplicate the two
 * queries to the same cache slot, so whichever hook executed its queryFn
 * first would win and the other would receive the same payload (alerts
 * shown as observations, etc.).
 */
function resolveByMode<T>(
  data: T[],
  projectLocalId: string | null,
  hookName: string,
  mode: StorybookDataMode,
) {
  const queryKey = [
    // include the mode in the key so toggling it re-runs the query
    mode,
    hookName,
    projectLocalId,
  ];
  switch (mode) {
    case 'loading':
      return {
        queryKey,
        queryFn: () => new Promise<{ data: T[] }>(() => {}),
      };
    case 'error':
      return {
        queryKey,
        queryFn: () =>
          Promise.reject(
            new Error('Mock network error (Storybook dataMode=error)'),
          ),
      };
    case 'empty':
      return { queryKey, queryFn: () => Promise.resolve({ data: [] as T[] }) };
    case 'normal':
    default:
      // The queryKey above intentionally omits `data`: it's a module-level
      // constant fixture (MOCK_PROJECTS / MOCK_OBSERVATIONS / MOCK_ALERTS)
      // and the same reference is passed in on every call. Including it
      // would just bloat the cache key without adding any re-run signal.
      // eslint-disable-next-line @tanstack/query/exhaustive-deps
      return { queryKey, queryFn: () => Promise.resolve({ data }) };
  }
}

export function useProjects() {
  const { projectDataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<Project>(
    MOCK_PROJECTS,
    'all-projects',
    'projects',
    projectDataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: Project[] }) => data.data,
  });
}

export function useObservations(projectLocalId: string | null) {
  const { dataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<Observation>(
    MOCK_OBSERVATIONS,
    projectLocalId,
    'observations',
    dataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: Observation[] }) => data.data,
  });
}

export function useAlerts(projectLocalId: string | null) {
  const { dataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<Alert>(
    MOCK_ALERTS,
    projectLocalId,
    'alerts',
    dataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: Alert[] }) => data.data,
  });
}

export function useCreateAlert() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

// ---------------------------------------------------------------------------
// Case hooks (local-only foundation for #268 — no remote Case sync)
// ---------------------------------------------------------------------------

export function useStoragePersist() {
  const { caseStorageState } = useStorybookDataStore.getState();
  const state = caseStorageState;
  return {
    state,
    isPersisted: state === 'persisted' || state === 'quota-risk',
    isLoading: false,
    isEvictionRisk: state === 'denied' || state === 'quota-risk',
    quota: state === 'quota-risk' ? 1000 : null,
    usage: state === 'quota-risk' ? 900 : null,
    usagePercent: state === 'quota-risk' ? 90 : null,
  };
}

/**
 * Mock Cases for Storybook stories. Mirrors the real Case shape from db.ts.
 */
interface MockCase {
  localId: string;
  projectLocalId: string;
  title: string;
  caseType:
    | 'invasion_occupation'
    | 'territorial_encroachment'
    | 'deforestation_logging'
    | 'illegal_mining'
    | 'fire'
    | 'wildlife_exploitation'
    | 'pollution_contamination'
    | 'threats_violence'
    | 'rights_violation'
    | 'other';
  status: 'draft' | 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  revision: number;
  createdBy: string;
  deleted: boolean;
}

export const MOCK_CASES: MockCase[] = [
  {
    localId: 'case-1',
    projectLocalId: 'proj-1',
    title: 'Illegal Logging Investigation',
    caseType: 'illegal_mining',
    status: 'active',
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
    revision: 3,
    createdBy: 'local',
    deleted: false,
  },
  {
    localId: 'case-2',
    projectLocalId: 'proj-1',
    title: 'River Contamination Incident',
    caseType: 'fire',
    status: 'closed',
    createdAt: '2025-02-10T08:00:00Z',
    updatedAt: '2025-02-15T16:30:00Z',
    revision: 5,
    createdBy: 'local',
    deleted: false,
  },
];

/**
 * Mock useCases — mirrors the real hook's return shape from useCases.ts.
 * Returns MOCK_CASES by default; respects dataMode for loading/error/empty.
 */
export function useCases(projectLocalId: string | null) {
  const { caseDataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<MockCase>(
    MOCK_CASES,
    projectLocalId,
    'cases',
    caseDataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: MockCase[] }) => data.data,
    enabled: projectLocalId !== null,
  });
}

/**
 * Mock useCase — mirrors the real hook's return shape from useCase.ts.
 * Returns the matching MOCK_CASES entry (or null) by default; respects
 * caseDetailDataMode for loading/error/not-found states.
 */
export function useCase(projectLocalId: string | null, caseId: string | null) {
  const { caseDetailDataMode } = useStorybookDataStore.getState();
  const queryKey = ['case', projectLocalId, caseId, caseDetailDataMode];
  const enabled = projectLocalId !== null && caseId !== null;

  return useQuery<MockCase | null>({
    queryKey,
    queryFn: () => {
      if (caseDetailDataMode === 'loading') {
        return new Promise<MockCase | null>(() => {});
      }
      if (caseDetailDataMode === 'error') {
        return Promise.reject(
          new Error('Mock network error (Storybook caseDetail)'),
        );
      }
      if (caseDetailDataMode === 'not-found') {
        return Promise.resolve(null);
      }
      const found = MOCK_CASES.find(
        (c) => c.localId === caseId && c.projectLocalId === projectLocalId,
      );
      return Promise.resolve(found ?? null);
    },
    enabled,
  });
}

/**
 * Mock useCaseActivity — returns an empty array by default.
 */
interface MockCaseActivity {
  localId: string;
  caseLocalId: string;
  projectLocalId: string;
  event: string;
  status?: string;
  createdAt: string;
}

export const MOCK_CASE_ACTIVITY: MockCaseActivity[] = [
  {
    localId: 'act-1',
    caseLocalId: 'case-1',
    projectLocalId: 'proj-1',
    event: 'created',
    status: 'draft',
    createdAt: '2025-01-15T10:30:00Z',
  },
  {
    localId: 'act-2',
    caseLocalId: 'case-1',
    projectLocalId: 'proj-1',
    event: 'status_changed',
    status: 'active',
    createdAt: '2025-01-20T14:00:00Z',
  },
];

export function useCaseActivity(
  projectLocalId: string | null,
  caseId: string | null,
) {
  const { caseDataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<MockCaseActivity>(
    MOCK_CASE_ACTIVITY,
    projectLocalId,
    'caseActivity',
    caseDataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: MockCaseActivity[] }) => data.data,
    enabled: projectLocalId !== null && caseId !== null,
  });
}

/**
 * Mock useCaseReportStates — returns per-agency report states.
 */
interface MockCaseReportState {
  localId: string;
  caseLocalId: string;
  projectLocalId: string;
  agency: 'FUNAI' | 'IBAMA' | 'MPF' | 'PF';
  status: 'incomplete' | 'complete' | 'error';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export const MOCK_CASE_REPORT_STATES: MockCaseReportState[] = [
  {
    localId: 'rs-1',
    caseLocalId: 'case-1',
    projectLocalId: 'proj-1',
    agency: 'FUNAI',
    status: 'complete',
    revision: 1,
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
  },
  {
    localId: 'rs-2',
    caseLocalId: 'case-1',
    projectLocalId: 'proj-1',
    agency: 'IBAMA',
    status: 'incomplete',
    revision: 1,
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
  },
];

export function useCaseReportStates(
  projectLocalId: string | null,
  caseId: string | null,
) {
  const { caseDataMode } = useStorybookDataStore.getState();
  const { queryKey, queryFn } = resolveByMode<MockCaseReportState>(
    MOCK_CASE_REPORT_STATES,
    projectLocalId,
    'caseReportStates',
    caseDataMode,
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: MockCaseReportState[] }) => data.data,
    enabled: projectLocalId !== null && caseId !== null,
  });
}

/**
 * Mock mutation hooks — no-ops in Storybook (the data is fixture-driven).
 */
export function useCreateCase() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

export function useUpdateCase() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

export function useDeleteCase() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

export function useRecordCaseActivity() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

export function useUpsertCaseReportState() {
  return useMutation({
    mutationFn: async (_data: unknown) => {
      /* no-op */
    },
  });
}

// ---------------------------------------------------------------------------
// Additional hooks used by HomeScreen / ArchiveBrowser
// ---------------------------------------------------------------------------

/**
 * Mock useArchiveStatus — matches the real hook's return shape:
 * { servers: ArchiveServerStatus[], anyError, anySyncing }
 *
 * Derives servers from the mock auth store so the data is consistent.
 */
export function useArchiveStatus() {
  const servers = useAuthStore.getState().servers;

  return {
    servers: servers.map((s) => ({
      id: s.id,
      label: s.label,
      baseUrl: s.baseUrl,
      isSyncing: s.status === 'syncing',
      lastSyncedAt: s.lastSyncedAt ?? null,
      error: s.status === 'error' ? (s.errorMessage ?? 'Sync error') : null,
      hasCredentials: typeof s.token === 'string' && s.token.length > 0,
      isStale: s.lastSyncedAt
        ? Date.now() - new Date(s.lastSyncedAt).getTime() > 24 * 60 * 60 * 1000
        : true,
    })),
    anyError: servers.some((s) => s.status === 'error'),
    anySyncing: servers.some((s) => s.status === 'syncing'),
  };
}

export function useProjectCoverage(
  _projectLocalId: string | null,
  _params?: unknown,
) {
  return {
    results: [],
    isCalculating: false,
    error: null,
  };
}

/**
 * Mock useRemoteArchives — matches the real hook's return shape:
 * { archives: RemoteArchive[], selectedArchiveId, selectArchive, localProjects }
 *
 * Returns fixture data aligned with mock projects and auth store.
 */
export function useRemoteArchives() {
  const { selectedArchiveId, selectArchive } = useArchiveStore.getState();

  return {
    archives: [
      {
        archiveId: '_local',
        name: 'Local',
        url: null,
        projectCount: 2,
      },
      {
        archiveId: 'https://archive.amazon.example.com',
        name: 'Amazon Archive',
        url: 'https://archive.amazon.example.com',
        projectCount: 1,
      },
      {
        archiveId: 'https://archive.cerrado.example.com',
        name: 'Cerrado Archive',
        url: 'https://archive.cerrado.example.com',
        projectCount: 1,
      },
    ],
    selectedArchiveId,
    selectArchive,
    localProjects: MOCK_PROJECTS,
  };
}
