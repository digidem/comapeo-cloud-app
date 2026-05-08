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
}

export interface ArchiveStatus {
  servers: ArchiveServerStatus[];
  anyError: boolean;
  anySyncing: boolean;
}

export function useArchiveStatus(): ArchiveStatus {
  const servers = useAuthStore((s) => s.servers);
  const [cachedServers, setCachedServers] = useState<ArchiveServerStatus[]>([]);

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
  }, []);

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
      })),
    [servers],
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
