import { useEffect, useMemo, useState } from 'react';

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

export function useArchiveStatus(): ArchiveStatus {
  const servers = useAuthStore((s) => s.servers);
  const [cachedServers, setCachedServers] = useState<ArchiveServerStatus[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Refresh the current timestamp every 60 seconds for stale detection
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
     
  }, []);

  // Load remote servers from IndexedDB on mount

  useEffect(() => {
    let cancelled = false;

    getRemoteServers().then(
      (records) => {
        if (cancelled) return;
        setCachedServers(
          records.map((record) => ({
            id: record.id,
            label: record.label ?? record.baseUrl,
            baseUrl: record.baseUrl,
            isSyncing: record.status === 'syncing',
            lastSyncedAt: record.lastSyncedAt ?? null,
            error: record.status === 'error' ? 'Sync error' : null,
            hasCredentials: false,
            isStale:
              record.lastSyncedAt !== null
                ? now - new Date(record.lastSyncedAt).getTime() >
                  24 * 60 * 60 * 1000
                : true,
          })),
        );
      },
      () => {
        if (!cancelled) setCachedServers([]);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [servers]);

  const mapped: ArchiveServerStatus[] = useMemo(
    () =>
      servers.map((s) => ({
        id: s.id,
        label: s.label,
        baseUrl: s.baseUrl,
        isSyncing: s.status === 'syncing',
        lastSyncedAt: s.lastSyncedAt ?? null,
        error:
          s.status === 'error' ? (s.errorMessage ?? 'Unknown error') : null,
        hasCredentials: typeof s.token === 'string' && s.token.length > 0,
        isStale:
          s.lastSyncedAt !== null
            ? now - new Date(s.lastSyncedAt).getTime() > 24 * 60 * 60 * 1000
            : true,
      })),
    [servers, now],
  );

  const merged = useMemo(() => {
    const authServerIds = new Set(mapped.map((s) => s.id));
    return [
      ...mapped,
      ...cachedServers.filter((s) => !authServerIds.has(s.id)),
    ];
  }, [mapped, cachedServers]);

  return useMemo(
    () => ({
      servers: merged,
      anyError: merged.some((s) => s.error !== null),
      anySyncing: merged.some((s) => s.isSyncing),
    }),
    [merged],
  );
}
