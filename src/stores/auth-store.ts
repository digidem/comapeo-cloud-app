import { create } from 'zustand';

import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { setComapeoStorageItem } from '@/lib/comapeo-local-storage';
import {
  createRemoteServer,
  deleteRemoteServer,
  getRemoteServers,
  updateRemoteServer,
} from '@/lib/local-repositories';
import { requireSecurityStartupReady } from '@/lib/security-startup-gate';

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
  token: string | null;
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
  // these are synchronized from the active runtime server record.
  isAuthenticated: boolean;
  hasHydratedServers: boolean;

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
    updates: Partial<Omit<RemoteArchiveServer, 'id'>>,
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

  // Backward-compatible aliases. Archive credentials remain runtime-only;
  // non-secret archive metadata continues through the repository path.
  setToken: (token: string) => Promise<void>;
  restoreServerToken: (id: string, token: string | null) => void;
  lockServerCredential: (identity: AuthIdentity) => void;
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

/**
 * Servers that can be synced right now: reachable (baseUrl), credentialed
 * (token), and not abandoned during onboarding. Single source of truth for
 * manual sync triggers (`useSyncAll`, `SyncAllButton`).
 */
export function selectSyncableServers(
  state: Pick<AuthState, 'servers'>,
): Array<RemoteArchiveServer & { token: string }> {
  return state.servers.filter(
    (server): server is RemoteArchiveServer & { token: string } =>
      Boolean(
        server.baseUrl &&
        server.token &&
        server.onboardingStatus !== 'cancelled',
      ),
  );
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
    setComapeoStorageItem(ACTIVE_SERVER_STORAGE_KEY, id);
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
  hasHydratedServers: false,

  setTier: (tier) => set({ tier }),

  addServer: async (config) => {
    requireSecurityStartupReady();
    const normalized = normalizeForIdentity(config.baseUrl);
    const existing = get().servers.find(
      (server) => normalizeForIdentity(server.baseUrl) === normalized,
    );

    if (existing) {
      if (!config.allowDuplicate) {
        throw new DuplicateServerError(existing.id, existing.baseUrl);
      }

      if (existing.token !== config.token) {
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
    if (updates.token !== undefined) requireSecurityStartupReady();
    const { token: _runtimeToken, ...metadataUpdates } = updates;
    if (Object.keys(metadataUpdates).length > 0) {
      await updateRemoteServer(id, metadataUpdates);
    }

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
      const currentState = get();
      const runtimeServers = new Map(
        currentState.servers.map((server) => [server.id, server]),
      );
      const servers: RemoteArchiveServer[] = records.map((record) => {
        const runtimeServer = runtimeServers.get(record.id);
        const runtimeToken =
          runtimeServer &&
          normalizeForIdentity(runtimeServer.baseUrl) ===
            normalizeForIdentity(record.baseUrl)
            ? runtimeServer.token
            : null;

        return {
          id: record.id,
          label: record.label ?? record.baseUrl,
          baseUrl: record.baseUrl,
          token: runtimeToken,
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
            ArchiveLifecycleStatus | undefined,
          errorMessage: record.errorMessage,
        };
      });

      const currentActiveId = currentState.activeServerId;
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
        hasHydratedServers: true,
        ...deriveActiveFields(servers, activeServerId),
      });
    } catch (error) {
      console.warn('Failed to hydrate servers from database:', error);
    }
  },

  clearAll: () => {
    try {
      persistActiveServerId(null);
    } catch {
      // Storage can be blocked independently of in-memory state. Clearing the
      // active connection must still succeed so callers can finish a full reset.
    }
    set({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
      hasHydratedServers: false,
    });
  },

  setToken: async (token) => {
    requireSecurityStartupReady();
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

  restoreServerToken: (id, token) => {
    set((state) => {
      const servers = state.servers.map((server) =>
        server.id === id ? { ...server, token } : server,
      );
      return {
        servers,
        ...deriveActiveFields(servers, state.activeServerId),
      };
    });
  },

  lockServerCredential: (identity) => {
    if (!identity.activeServerId || !identity.baseUrl) return;

    set((state) => {
      const server = state.servers.find(
        (candidate) => candidate.id === identity.activeServerId,
      );
      if (
        !server ||
        normalizeForIdentity(server.baseUrl) !==
          normalizeForIdentity(identity.baseUrl ?? '') ||
        server.token !== identity.token
      ) {
        return {};
      }

      const servers = state.servers.map((candidate) =>
        candidate.id === identity.activeServerId
          ? { ...candidate, token: null }
          : candidate,
      );
      return {
        servers,
        ...deriveActiveFields(servers, state.activeServerId),
      };
    });
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
    set((state) => {
      if (expectedIdentity && !matchesAuthIdentity(state, expectedIdentity)) {
        return {};
      }

      if (state.activeServerId) {
        const servers = state.servers.map((server) =>
          server.id === state.activeServerId
            ? { ...server, token: null }
            : server,
        );
        return {
          servers,
          ...deriveActiveFields(servers, state.activeServerId),
        };
      }

      return {
        token: null,
        baseUrl: null,
        isAuthenticated: false,
      };
    });
  },
}));
