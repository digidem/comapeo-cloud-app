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
export type ArchiveLifecycleStatus =
  | 'validating'
  | 'pending'
  | 'syncing'
  | 'ready'
  | 'partial'
  | 'error'
  | 'cancelled';

export interface RemoteArchiveServer {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  lastSyncedAt?: string;
  lastSuccessfulSyncAt?: string;
  onboardingStatus?: ArchiveLifecycleStatus;
  status:
    | 'idle'
    | 'pending'
    | 'syncing'
    | 'connected'
    | 'partial'
    | 'offline'
    | 'error'
    | 'cancelled';
  errorMessage?: string;
}

export interface ActiveArchiveState {
  servers: RemoteArchiveServer[];
  activeServerId: string | null;
  token: string | null;
  baseUrl: string | null;
}

export interface AuthIdentity {
  activeServerId: string | null;
  baseUrl: string | null;
  token: string | null;
}

export interface AuthState extends ActiveArchiveState {
  // Tier
  tier: AuthTier;

  // Compatibility fields for non-archive callers. When an archive is active,
  // these are synchronized from the active persisted server record.
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
  updateServerLifecycle: (
    id: string,
    updates: {
      status: RemoteArchiveServer['status'];
      onboardingStatus: ArchiveLifecycleStatus;
      errorMessage?: string;
      lastSuccessfulSyncAt?: string;
    },
  ) => Promise<void>;
  hydrateServers: () => Promise<void>;
  clearAll: () => void;

  // Backward-compatible aliases. Active archive edits use the persisted
  // repository path; standalone values remain available for non-archive tiers.
  setToken: (token: string) => Promise<void>;
  setBaseUrl: (url: string) => Promise<void>;
  clearAuth: (expectedIdentity?: AuthIdentity) => Promise<void>;
}

// Selectors
// ---------------------------------------------------------------------------

export function selectActiveServer(
  state: Pick<AuthState, 'servers' | 'activeServerId'>,
): RemoteArchiveServer | null {
  if (state.activeServerId === null) return null;
  return (
    state.servers.find((server) => server.id === state.activeServerId) ?? null
  );
}

export function selectActiveToken(
  state: Pick<AuthState, 'servers' | 'activeServerId' | 'token'>,
): string | null {
  const activeServer = selectActiveServer(state);
  if (activeServer) return activeServer.token || null;

  // Preserve the non-archive credential contract when no archive is selected.
  // Store actions clear these compatibility values whenever selection clears,
  // so they cannot override an active persisted archive record.
  return state.token;
}

export function selectActiveBaseUrl(
  state: Pick<AuthState, 'servers' | 'activeServerId' | 'baseUrl'>,
): string | null {
  const activeServer = selectActiveServer(state);
  if (activeServer) return activeServer.baseUrl || null;

  return state.baseUrl;
}

export function selectIsAuthenticated(
  state: Pick<AuthState, 'servers' | 'activeServerId' | 'token' | 'baseUrl'>,
): boolean {
  return Boolean(selectActiveToken(state) && selectActiveBaseUrl(state));
}

// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_SERVER_STORAGE_KEY = 'comapeo:activeServerId';

function deriveActiveFields(
  servers: RemoteArchiveServer[],
  activeServerId: string | null,
): Pick<AuthState, 'token' | 'baseUrl' | 'isAuthenticated'> {
  const activeServer =
    activeServerId === null
      ? undefined
      : servers.find((server) => server.id === activeServerId);

  const token = activeServer?.token || null;
  const baseUrl = activeServer?.baseUrl || null;

  return {
    token,
    baseUrl,
    isAuthenticated: Boolean(token && baseUrl),
  };
}

function persistActiveServerId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_SERVER_STORAGE_KEY);
  } else {
    localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, id);
  }
}

function normalizeForIdentity(baseUrl: string): string {
  const normalized = normalizeArchiveBaseUrl(baseUrl);
  return normalized.ok ? normalized.value : baseUrl.trim().replace(/\/+$/, '');
}

function matchesAuthIdentity(
  state: AuthState,
  identity: AuthIdentity,
): boolean {
  return (
    state.activeServerId === identity.activeServerId &&
    selectActiveBaseUrl(state) === identity.baseUrl &&
    selectActiveToken(state) === identity.token
  );
}

// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()((set, get) => ({
  tier: 'local',
  servers: [],
  activeServerId: null,
  token: null,
  baseUrl: null,
  isAuthenticated: false,

  setTier: (tier) => set({ tier }),

  addServer: async (config) => {
    const normalized = normalizeForIdentity(config.baseUrl);
    const existing = get().servers.find(
      (server) => normalizeForIdentity(server.baseUrl) === normalized,
    );

    if (existing) {
      if (!config.allowDuplicate) {
        throw new DuplicateServerError(existing.id, existing.baseUrl);
      }

      if (existing.token !== config.token) {
        await updateRemoteServer(existing.id, { token: config.token });
        set((state) => {
          const servers = state.servers.map((server) =>
            server.id === existing.id
              ? { ...server, token: config.token }
              : server,
          );
          return {
            servers,
            ...deriveActiveFields(servers, state.activeServerId),
          };
        });
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

    set((state) => ({ servers: [...state.servers, newServer] }));
    return server.id;
  },

  removeServer: async (id) => {
    await deleteRemoteServer(id);
    set((state) => {
      const servers = state.servers.filter((server) => server.id !== id);
      const activeServerId =
        state.activeServerId === id
          ? (servers[0]?.id ?? null)
          : state.activeServerId;

      if (state.activeServerId === id) {
        persistActiveServerId(activeServerId);
      }

      return {
        servers,
        activeServerId,
        ...deriveActiveFields(servers, activeServerId),
      };
    });
  },

  setActiveServer: (id) => {
    set((state) => {
      if (id === null) {
        persistActiveServerId(null);
        return {
          activeServerId: null,
          ...deriveActiveFields(state.servers, null),
        };
      }

      if (!state.servers.some((server) => server.id === id)) {
        console.warn(`setActiveServer: unknown server id "${id}" — ignoring`);
        return {};
      }

      persistActiveServerId(id);
      return {
        activeServerId: id,
        ...deriveActiveFields(state.servers, id),
      };
    });
  },

  updateServerStatus: async (id, status, errorMessage) => {
    const nextErrorMessage = status === 'error' ? errorMessage : undefined;
    // A successful connection is also the most recent sync point.
    const lastSyncedAt =
      status === 'connected' ? new Date().toISOString() : undefined;

    await updateRemoteServer(id, {
      status,
      errorMessage: nextErrorMessage,
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
    });

    set((state) => {
      const servers = state.servers.map((server) =>
        server.id === id
          ? {
              ...server,
              status,
              errorMessage: nextErrorMessage,
              ...(lastSyncedAt ? { lastSyncedAt } : {}),
            }
          : server,
      );

      return {
        servers,
        ...deriveActiveFields(servers, state.activeServerId),
      };
    });
  },

  updateServerLifecycle: async (id, updates) => {
    const persistedUpdates = {
      status: updates.status,
      onboardingStatus: updates.onboardingStatus,
      errorMessage: updates.errorMessage,
      ...(updates.lastSuccessfulSyncAt !== undefined
        ? {
            lastSuccessfulSyncAt: updates.lastSuccessfulSyncAt,
            lastSyncedAt: updates.lastSuccessfulSyncAt,
          }
        : {}),
    };

    await updateRemoteServer(id, persistedUpdates);

    set((state) => {
      const servers = state.servers.map((server) =>
        server.id === id
          ? {
              ...server,
              ...persistedUpdates,
              lastSyncedAt:
                persistedUpdates.lastSyncedAt ?? server.lastSyncedAt,
              lastSuccessfulSyncAt:
                persistedUpdates.lastSuccessfulSyncAt ??
                server.lastSuccessfulSyncAt,
            }
          : server,
      );

      return {
        servers,
        ...deriveActiveFields(servers, state.activeServerId),
      };
    });
  },

  updateServer: async (id, updates) => {
    const persistedUpdates = {
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.baseUrl !== undefined ? { baseUrl: updates.baseUrl } : {}),
      ...(updates.token !== undefined ? { token: updates.token } : {}),
    };

    await updateRemoteServer(id, persistedUpdates);

    set((state) => {
      const servers = state.servers.map((server) =>
        server.id === id ? { ...server, ...updates } : server,
      );

      return {
        servers,
        ...deriveActiveFields(servers, state.activeServerId),
      };
    });
  },

  hydrateServers: async () => {
    try {
      const records = await getRemoteServers();
      const servers: RemoteArchiveServer[] = records.map((record) => ({
        id: record.id,
        label: record.label ?? record.baseUrl,
        baseUrl: record.baseUrl,
        token: record.token ?? '',
        status: ([
          'idle',
          'pending',
          'syncing',
          'connected',
          'partial',
          'offline',
          'error',
          'cancelled',
        ].includes(record.status)
          ? record.status
          : 'idle') as RemoteArchiveServer['status'],
        lastSyncedAt: record.lastSyncedAt || undefined,
        lastSuccessfulSyncAt: record.lastSuccessfulSyncAt || undefined,
        onboardingStatus: record.onboardingStatus as
          | ArchiveLifecycleStatus
          | undefined,
        errorMessage: record.errorMessage,
      }));

      const currentActiveId = get().activeServerId;
      const savedActiveId = localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY);
      const activeServerId =
        (currentActiveId &&
        servers.some((server) => server.id === currentActiveId)
          ? currentActiveId
          : null) ??
        (savedActiveId && servers.some((server) => server.id === savedActiveId)
          ? savedActiveId
          : null) ??
        servers[0]?.id ??
        null;

      persistActiveServerId(activeServerId);
      set({
        servers,
        activeServerId,
        ...deriveActiveFields(servers, activeServerId),
      });
    } catch (error) {
      console.warn('Failed to hydrate servers from database:', error);
    }
  },

  clearAll: () => {
    persistActiveServerId(null);
    set({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
    });
  },

  setToken: async (token) => {
    const state = get();
    if (state.activeServerId) {
      await state.updateServer(state.activeServerId, { token });
      return;
    }

    set((current) => ({
      token,
      isAuthenticated: Boolean(token && current.baseUrl),
    }));
  },

  setBaseUrl: async (baseUrl) => {
    const state = get();
    if (state.activeServerId) {
      await state.updateServer(state.activeServerId, { baseUrl });
      return;
    }

    set((current) => ({
      baseUrl,
      isAuthenticated: Boolean(current.token && baseUrl),
    }));
  },

  clearAuth: async (expectedIdentity) => {
    let clearedServerId: string | null = null;

    set((state) => {
      if (expectedIdentity && !matchesAuthIdentity(state, expectedIdentity)) {
        return {};
      }

      clearedServerId = state.activeServerId;
      persistActiveServerId(null);

      return {
        servers: state.servers.map((server) =>
          server.id === clearedServerId ? { ...server, token: '' } : server,
        ),
        activeServerId: null,
        token: null,
        baseUrl: null,
        isAuthenticated: false,
      };
    });

    if (clearedServerId) {
      await updateRemoteServer(clearedServerId, { token: '' });
    }
  },
}));
