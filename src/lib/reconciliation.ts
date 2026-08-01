import type { EndpointReconciliationMode } from '@/lib/api-client';

export interface ReconciliableRow {
  localId: string;
  deleted: boolean;
  updatedAt: string;
  dirtyLocal?: boolean;
}

export interface ReconciliationCounts {
  received: number;
  upserted: number;
  explicitTombstones: number;
  omittedTombstones: number;
  tombstoned: number;
  preserved: number;
}

export interface ReconciliationPlan<T extends ReconciliableRow> {
  rowsToPut: T[];
  activeRows: T[];
  tombstonedRows: T[];
  counts: ReconciliationCounts;
}

interface PlanReconciliationOptions<T extends ReconciliableRow> {
  existing: readonly T[];
  incoming: readonly T[];
  mode: EndpointReconciliationMode;
  now?: string;
}

/**
 * Build a deterministic reconciliation plan without mutating either input.
 *
 * - snapshot: omitted live rows become local tombstones
 * - delta / tombstone-stream / unknown: omitted rows are preserved
 * - explicit server tombstones are always persisted
 */
export function planReconciliation<T extends ReconciliableRow>({
  existing,
  incoming,
  mode,
  now = new Date().toISOString(),
}: PlanReconciliationOptions<T>): ReconciliationPlan<T> {
  const incomingIds = new Set(incoming.map((row) => row.localId));
  const explicitTombstones = incoming.filter((row) => row.deleted);
  const omittedLiveRows = existing.filter(
    (row) => !row.deleted && !incomingIds.has(row.localId),
  );
  const tombstoneEligibleRows = omittedLiveRows.filter(
    (row) => !row.dirtyLocal,
  );

  const omittedTombstones =
    mode === 'snapshot'
      ? tombstoneEligibleRows.map((row) => ({
          ...row,
          deleted: true,
          updatedAt: now,
        }))
      : [];

  const rowsToPut = [...incoming, ...omittedTombstones] as T[];
  const tombstonedRows = [...explicitTombstones, ...omittedTombstones] as T[];

  return {
    rowsToPut,
    activeRows: incoming.filter((row) => !row.deleted) as T[],
    tombstonedRows,
    counts: {
      received: incoming.length,
      upserted: incoming.length,
      explicitTombstones: explicitTombstones.length,
      omittedTombstones: omittedTombstones.length,
      tombstoned: tombstonedRows.length,
      preserved:
        mode === 'snapshot'
          ? omittedLiveRows.length - tombstoneEligibleRows.length
          : omittedLiveRows.length,
    },
  };
}
