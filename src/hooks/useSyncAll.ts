import { useCallback, useRef, useState } from 'react';

import { syncRemoteArchive } from '@/lib/data-layer';
import type { SyncErrorCode, SyncStatus } from '@/lib/sync';
import { selectSyncableServers, useAuthStore } from '@/stores/auth-store';

/** Outcome of one eligible server inside a `sync()` run. */
export interface SyncAllServerResult {
  serverId: string;
  label: string;
  success: boolean;
  status: SyncStatus;
  errorCode?: SyncErrorCode;
}

/**
 * Outcome of a `sync()` run across every eligible server. `total` is the
 * eligible-server count, so it stays meaningful even when the run failed
 * before any per-server result could be produced.
 */
export interface SyncAllSummary {
  total: number;
  results: SyncAllServerResult[];
}

/**
 * Hook for manually triggering a sync of all configured archive servers.
 * The application coordinator owns per-archive locking, status transitions,
 * and cache invalidation.
 *
 * `sync()` resolves a `SyncAllSummary` on every path — callers await it and
 * surface the outcome (there is deliberately no `lastResult` state, which
 * would replay toasts on remounts under StrictMode). A re-entrant call while
 * a run is already in flight resolves an empty summary and reports nothing.
 */
export function useSyncAll(): {
  sync: () => Promise<SyncAllSummary>;
  isSyncing: boolean;
} {
  const [isSyncing, setIsSyncing] = useState(false);
  const isRunningRef = useRef(false);

  const sync = useCallback(async (): Promise<SyncAllSummary> => {
    if (isRunningRef.current) return { total: 0, results: [] };
    isRunningRef.current = true;
    setIsSyncing(true);

    const eligibleServers = selectSyncableServers(useAuthStore.getState());

    try {
      if (eligibleServers.length === 0) return { total: 0, results: [] };

      const settled = await Promise.allSettled(
        eligibleServers.map((server) =>
          syncRemoteArchive(server.id, {
            baseUrl: server.baseUrl,
            token: server.token,
          }),
        ),
      );

      const results: SyncAllServerResult[] = eligibleServers.map(
        (server, index) => {
          const outcome = settled[index];
          if (!outcome || outcome.status === 'rejected') {
            console.warn(
              '[useSyncAll] sync error:',
              outcome?.status === 'rejected' ? outcome.reason : undefined,
            );
            return {
              serverId: server.id,
              label: server.label,
              success: false,
              status: 'error' as const,
            };
          }

          const result = outcome.value;
          if (!result.success || result.status !== 'ready') {
            console.warn(
              `[useSyncAll] archive sync settled as ${result.status}:`,
              result.error ?? result.warnings,
            );
          }

          return {
            serverId: server.id,
            label: server.label,
            success: result.success,
            status: result.status,
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          };
        },
      );

      return { total: eligibleServers.length, results };
    } catch {
      // Unexpected error — report it instead of leaving the caller without
      // an outcome, then swallow to avoid unhandled rejections.
      return {
        total: eligibleServers.length,
        results: eligibleServers.map((server) => ({
          serverId: server.id,
          label: server.label,
          success: false,
          status: 'error' as const,
        })),
      };
    } finally {
      isRunningRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  return { sync, isSyncing };
}
