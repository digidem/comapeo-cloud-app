/**
 * Mock hooks for Storybook.
 *
 * Provides controlled data for TanStack Query hooks used by screens.
 * Import these and pass them as story parameters via module aliasing.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

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

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => Promise.resolve({ data: MOCK_PROJECTS }),
    select: (data: { data: Project[] }) => data.data,
  });
}

export function useObservations(_projectLocalId: string | null) {
  return useQuery({
    queryKey: ['observations', _projectLocalId],
    queryFn: () => Promise.resolve({ data: MOCK_OBSERVATIONS }),
    select: (data: { data: Observation[] }) => data.data,
  });
}

export function useAlerts(_projectLocalId: string | null) {
  return useQuery({
    queryKey: ['alerts', _projectLocalId],
    queryFn: () => Promise.resolve({ data: MOCK_ALERTS }),
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
// Additional hooks used by HomeScreen
// ---------------------------------------------------------------------------

export function useArchiveStatus(_serverId: string) {
  return useQuery({
    queryKey: ['archive-status', _serverId],
    queryFn: async () => ({
      serverId: _serverId,
      lastSync: new Date().toISOString(),
      status: 'connected' as const,
      observationCount: 42,
    }),
  });
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

export function useRemoteArchives() {
  return useQuery({
    queryKey: ['remote-archives'],
    queryFn: async () => [],
  });
}
