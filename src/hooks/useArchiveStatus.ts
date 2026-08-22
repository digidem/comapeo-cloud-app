import { useEffect, useMemo, useState } from 'react';

import type { RemoteServer } from '@/lib/db';
import { getRemoteServers } from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

export interface ArchiveServerStatus {
  id: string;
  label: string;
  baseUrl: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  hasCredentials: boolean;
  isStale: boolean;
}

export interface ArchiveStatus {
  servers: ArchiveServerStatus[];
  anyError: boolean;
  anySyncing: boolean;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function useArchiveStatus(): ArchiveStatus {
  const runtimeServers = useAuthStore((state) => state.servers);
  const serversHydrated = useAuthStore((state) => state.hasHydratedServers);
  const [cachedRecords, setCachedRecords] = useState<RemoteServer[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (serversHydrated) return;

    let cancelled = false;
    void getRemoteServers().then(
      (records) => {
        if (!cancelled) setCachedRecords(records);
      },
      () => {
        // Keep the last successful metadata fallback available for retry/UI.
      },
    );

    return () => {
      cancelled = true;
    };
  }, [serversHydrated]);

  const mappedRuntime = useMemo<ArchiveServerStatus[]>(
    () =>
      runtimeServers.map((server) => ({
        id: server.id,
        label: server.label,
        baseUrl: server.baseUrl,
        isSyncing: server.status === 'syncing',
        lastSyncedAt: server.lastSyncedAt ?? null,
        error:
          server.status === 'error'
            ? (server.errorMessage ?? 'Unknown error')
            : null,
        hasCredentials:
          typeof server.token === 'string' && server.token.length > 0,
        isStale: server.lastSyncedAt
          ? now - new Date(server.lastSyncedAt).getTime() > STALE_AFTER_MS
          : true,
      })),
    [runtimeServers, now],
  );

  const mappedFallback = useMemo<ArchiveServerStatus[]>(
    () =>
      cachedRecords.map((record) => ({
        id: record.id,
        label: record.label ?? record.baseUrl,
        baseUrl: record.baseUrl,
        isSyncing: record.status === 'syncing',
        lastSyncedAt: record.lastSyncedAt ?? null,
        error: record.status === 'error' ? 'Sync error' : null,
        hasCredentials: false,
        isStale: record.lastSyncedAt
          ? now - new Date(record.lastSyncedAt).getTime() > STALE_AFTER_MS
          : true,
      })),
    [cachedRecords, now],
  );

  const merged = useMemo(() => {
    if (serversHydrated) return mappedRuntime;

    const runtimeIds = new Set(mappedRuntime.map((server) => server.id));
    return [
      ...mappedRuntime,
      ...mappedFallback.filter((server) => !runtimeIds.has(server.id)),
    ];
  }, [mappedFallback, mappedRuntime, serversHydrated]);

  return useMemo(
    () => ({
      servers: merged,
      anyError: merged.some((server) => server.error !== null),
      anySyncing: merged.some((server) => server.isSyncing),
    }),
    [merged],
  );
}
