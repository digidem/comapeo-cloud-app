/**
 * Mock hooks for Storybook.
 *
 * Provides controlled data for TanStack Query hooks used by screens.
 * Import these and pass them as story parameters via module aliasing.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import { useStorybookDataStore } from '../storybook-loading-control';
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
) {
  const dataMode = useStorybookDataStore.getState().dataMode;
  const queryKey = [
    // include the mode in the key so toggling it re-runs the query
    dataMode,
    hookName,
    projectLocalId,
  ];
  switch (dataMode) {
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
  const { queryKey, queryFn } = resolveByMode<Project>(
    MOCK_PROJECTS,
    'all-projects',
    'projects',
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: Project[] }) => data.data,
  });
}

export function useObservations(projectLocalId: string | null) {
  const { queryKey, queryFn } = resolveByMode<Observation>(
    MOCK_OBSERVATIONS,
    projectLocalId,
    'observations',
  );
  return useQuery({
    queryKey,
    queryFn,
    select: (data: { data: Observation[] }) => data.data,
  });
}

export function useAlerts(projectLocalId: string | null) {
  const { queryKey, queryFn } = resolveByMode<Alert>(
    MOCK_ALERTS,
    projectLocalId,
    'alerts',
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
  return useQuery({
    queryKey: ['project-coverage', _projectLocalId],
    queryFn: async () => ({
      totalArea: 12500,
      coveredArea: 8300,
      percentage: 66.4,
      method: 'grid' as const,
    }),
  });
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
