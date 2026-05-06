import { create } from 'zustand';

import {
  createRemoteServer,
  deleteRemoteServer,
  updateRemoteServer,
} from '@/lib/local-repositories';

// Types
// ---------------------------------------------------------------------------

export type AuthTier = 'local' | 'remoteArchive' | 'cloud';

export interface RemoteArchiveServer {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  lastSyncedAt?: string;
  status: 'idle' | 'syncing' | 'connected' | 'offline' | 'error';
  errorMessage?: string;
}

export interface AuthState {
  // Tier
  tier: AuthTier;

  // Remote archive servers
  servers: RemoteArchiveServer[];
  activeServerId: string | null;

  // Computed fields for backward compatibility with api-client
  token: string | null;
  baseUrl: string | null;
  isAuthenticated: boolean;

  // Actions
  setTier: (tier: AuthTier) => void;
  addServer: (config: {
    label: string;
    baseUrl: string;
    token: string;
  }) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  setActiveServer: (id: string | null) => void;
  updateServerStatus: (
    id: string,
    status: RemoteArchiveServer['status'],
    errorMessage?: string,
  ) => Promise<void>;
  clearAll: () => void;

  // Backward-compat aliases
  setToken: (token: string) => void;
  setBaseUrl: (url: string) => void;
  clearAuth: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Initial state: local tier
  tier: 'local',
  servers: [],
  activeServerId: null,

  // Computed — defaults for local tier
  token: null,
  baseUrl: null,
  isAuthenticated: false,

  setTier: (tier) => set({ tier }),

  addServer: async (config) => {
    const server = await createRemoteServer({
      baseUrl: config.baseUrl,
      label: config.label,
    });
    const newServer: RemoteArchiveServer = {
      id: server.id,
      label: config.label,
      baseUrl: config.baseUrl,
      token: config.token,
      status: 'idle',
    };
    set((state) => ({
      servers: [...state.servers, newServer],
    }));
  },

  removeServer: async (id) => {
    await deleteRemoteServer(id);
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
    }));
  },

  setActiveServer: (id) => {
    set((state) => {
      if (id === null) {
        return { activeServerId: null, token: null, baseUrl: null };
      }
      const server = state.servers.find((s) => s.id === id);
      return {
        activeServerId: id,
        token: server?.token ?? null,
        baseUrl: server?.baseUrl ?? null,
      };
    });
  },

  updateServerStatus: async (id, status, errorMessage) => {
    const now = status === 'connected' ? new Date().toISOString() : undefined;
    await updateRemoteServer(id, {
      status: status === 'connected' ? 'connected' : status,
      ...(now ? { lastSyncedAt: now } : {}),
    });
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id
          ? {
              ...s,
              status,
              ...(errorMessage !== undefined ? { errorMessage } : {}),
              ...(now ? { lastSyncedAt: now } : {}),
            }
          : s,
      ),
    }));
  },

  clearAll: () =>
    set({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
    }),

  // Backward-compat aliases — these preserve the old sessionStorage behavior
  // for api-client consumers until they fully migrate.
  setToken: (token) => {
    const state = get();
    if (state.activeServerId) {
      // Update the active server's token
      set((s) => ({
        servers: s.servers.map((sv) =>
          sv.id === s.activeServerId ? { ...sv, token } : sv,
        ),
        token,
      }));
    } else {
      set({ token });
    }
  },

  setBaseUrl: (url) => {
    const state = get();
    if (state.activeServerId) {
      set((s) => ({
        servers: s.servers.map((sv) =>
          sv.id === s.activeServerId ? { ...sv, baseUrl: url } : sv,
        ),
        baseUrl: url,
      }));
    } else {
      set({ baseUrl: url });
    }
  },

  clearAuth: () => set({ token: null, baseUrl: null, isAuthenticated: false }),
}));
