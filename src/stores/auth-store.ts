import { create } from 'zustand';

import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import {
  createRemoteServer,
  deleteRemoteServer,
  getRemoteServers,
  updateRemoteServer,
} from '@/lib/local-repositories';

// Types
// ---------------------------------------------------------------------------

export class DuplicateServerError extends Error {
  constructor(
    public readonly serverId: string,
    public readonly baseUrl: string,
  ) {
    super('This archive server has already been added');
    this.name = 'DuplicateServerError';
  }
}

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
    allowDuplicate?: boolean;
  }) => Promise<string>;
  removeServer: (id: string) => Promise<void>;
  setActiveServer: (id: string | null) => void;
  updateServerStatus: (
    id: string,
    status: RemoteArchiveServer['status'],
    errorMessage?: string,
  ) => Promise<void>;
  updateServer: (
    id: string,
    updates: { label?: string; baseUrl?: string; token?: string },
  ) => Promise<void>;
  hydrateServers: () => Promise<void>;
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
    // Deduplicate: if a server with the same baseUrl already exists,
    // update its token and return the existing ID instead of creating a duplicate.
    // Use the same normalization as AddArchiveServerDialog for consistency.
    const normalizedResult = normalizeArchiveBaseUrl(config.baseUrl);
    const normalized = normalizedResult.ok
      ? normalizedResult.value
      : config.baseUrl.trim().replace(/\/+$/, '');
    const existing = get().servers.find((s) => {
      const serverNormalized = normalizeArchiveBaseUrl(s.baseUrl);
      const serverUrl = serverNormalized.ok
        ? serverNormalized.value
        : s.baseUrl.trim().replace(/\/+$/, '');
      return serverUrl === normalized;
    });
    if (existing) {
      if (!config.allowDuplicate) {
        throw new DuplicateServerError(existing.id, existing.baseUrl);
      }
      // Update token if it changed
      if (existing.token !== config.token) {
        await updateRemoteServer(existing.id, { token: config.token });
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === existing.id ? { ...s, token: config.token } : s,
          ),
        }));
      }
      return existing.id;
    }

    const server = await createRemoteServer({
      baseUrl: config.baseUrl,
      label: config.label,
      token: config.token,
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
    return server.id;
  },

  removeServer: async (id) => {
    await deleteRemoteServer(id);
    set((state) => {
      const remaining = state.servers.filter((s) => s.id !== id);
      const wasActive = state.activeServerId === id;
      return {
        servers: remaining,
        ...(wasActive
          ? { activeServerId: null, token: null, baseUrl: null }
          : {}),
      };
    });
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

  updateServer: async (id, updates) => {
    await updateRemoteServer(id, {
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.baseUrl !== undefined ? { baseUrl: updates.baseUrl } : {}),
      ...(updates.token !== undefined ? { token: updates.token } : {}),
    });
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id
          ? {
              ...s,
              ...updates,
            }
          : s,
      ),
    }));
  },

  hydrateServers: async () => {
    try {
      const records = await getRemoteServers();
      const hydrated: RemoteArchiveServer[] = records.map((record) => ({
        id: record.id,
        label: record.label ?? record.baseUrl,
        baseUrl: record.baseUrl,
        token: record.token ?? '',
        status: (['idle', 'syncing', 'connected', 'offline', 'error'].includes(
          record.status,
        )
          ? record.status
          : 'idle') as RemoteArchiveServer['status'],
        lastSyncedAt: record.lastSyncedAt || undefined,
      }));
      set({ servers: hydrated });
      // Auto-select the first server if none is active yet (page refresh
      // restoration). setActiveServer reads the just-set server list to
      // populate baseUrl / token.
      if (hydrated.length > 0 && get().activeServerId === null) {
        get().setActiveServer(hydrated[0]!.id);
      }
    } catch {
      // IndexedDB not available — leave servers empty
    }
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
