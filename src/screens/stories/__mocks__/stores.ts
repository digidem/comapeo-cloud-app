/**
 * Mock Zustand stores for Storybook.
 *
 * Screens import these stores directly. In Storybook we want to control
 * their state via story args/parameters.
 */
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Project store mock
// ---------------------------------------------------------------------------

interface ProjectStoreState {
  selectedProjectId: string | null;
  selectedServerId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedServerId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>()((set) => ({
  selectedProjectId: null,
  selectedServerId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  setSelectedServerId: (id) => set({ selectedServerId: id }),
}));

// ---------------------------------------------------------------------------
// Auth store mock
// ---------------------------------------------------------------------------

interface RemoteArchiveServer {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  lastSyncedAt?: string;
  status: 'idle' | 'syncing' | 'connected' | 'offline' | 'error';
  errorMessage?: string;
}

interface AuthStoreState {
  isAuthenticated: boolean;
  tier: 'local' | 'remoteArchive' | 'cloud';
  servers: RemoteArchiveServer[];
  activeServerId: string | null;
  token: string | null;
  baseUrl: string | null;
  addServer: (server: {
    label: string;
    baseUrl: string;
    token: string;
  }) => Promise<string>;
  removeServer: (id: string) => Promise<void>;
  setActiveServer: (id: string | null) => void;
  setTier: (tier: AuthStoreState['tier']) => void;
  clearAll: () => void;
}

export const useAuthStore = create<AuthStoreState>()((set) => ({
  isAuthenticated: true,
  tier: 'local',
  servers: [
    {
      id: 'server-1',
      label: 'Amazon Archive',
      baseUrl: 'https://archive.amazon.example.com',
      token: 'mock-token-1',
      lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),
      status: 'connected',
    },
    {
      id: 'server-2',
      label: 'Cerrado Archive',
      baseUrl: 'https://archive.cerrado.example.com',
      token: 'mock-token-2',
      lastSyncedAt: new Date(Date.now() - 7200_000).toISOString(),
      status: 'connected',
    },
  ],
  activeServerId: null,
  token: null,
  baseUrl: null,
  addServer: async (server) => {
    const id = `server-${Date.now()}`;
    set((state) => ({
      servers: [
        ...state.servers,
        {
          ...server,
          id,
          status: 'idle' as const,
          lastSyncedAt: undefined,
        },
      ],
    }));
    return id;
  },
  removeServer: async (id) => {
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
    }));
  },
  setActiveServer: (id) => {
    set((state) => {
      if (id === null) return { activeServerId: null, token: null, baseUrl: null };
      const server = state.servers.find((s) => s.id === id);
      return {
        activeServerId: id,
        token: server?.token ?? null,
        baseUrl: server?.baseUrl ?? null,
      };
    });
  },
  setTier: (tier) => set({ tier }),
  clearAll: () =>
    set({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
    }),
}));

// ---------------------------------------------------------------------------
// Archive store mock (used by useRemoteArchives)
// ---------------------------------------------------------------------------

interface ArchiveStoreState {
  selectedArchiveId: string | null;
  selectArchive: (id: string | null) => void;
}

export const useArchiveStore = create<ArchiveStoreState>()((set) => ({
  selectedArchiveId: null,
  selectArchive: (id) => set({ selectedArchiveId: id }),
}));
