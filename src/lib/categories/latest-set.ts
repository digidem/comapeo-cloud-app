export interface PresetLike {
  docId: string;
  createdAt: string;
  deleted: boolean;
}

const DEFAULT_GAP_MS = 60 * 60 * 1000; // 60 minutes

function parseTimestamp(iso: string): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Selects only the newest time-clustered set of presets.
 *
 * Presets are grouped into clusters by temporal proximity using a rolling
 * 60-minute adjacency rule: adjacent presets (sorted by createdAt descending)
 * belong to the same cluster when the gap between their creation timestamps
 * is ≤ `gapMs` (default: 60 minutes). Only the newest cluster is returned.
 *
 * Presets with `deleted === true` are always excluded. Presets whose
 * `createdAt` cannot be parsed are excluded from the latest set but remain
 * visible under the "All" toggle.
 *
 * When all non-deleted presets fall into a single cluster (or there are zero /
 * one valid presets), the result is equivalent to all non-deleted presets.
 *
 * Returns an empty array when all presets are deleted or have unparseable
 * timestamps.
 */
export function selectLatestCategorySet<T extends PresetLike>(
  presets: T[],
  gapMs = DEFAULT_GAP_MS,
): T[] {
  // Drop deleted presets
  const active = presets.filter((p) => !p.deleted);

  // Parse createdAt; drop unparseable timestamps.
  // `withTimestamps` preserves the original input order (from `active`).
  const withTimestamps = active
    .map((preset) => {
      const ts = parseTimestamp(preset.createdAt);
      return ts !== null ? ({ preset, ts } as const) : null;
    })
    .filter(
      (entry): entry is { readonly preset: T; readonly ts: number } =>
        entry !== null,
    );

  if (withTimestamps.length <= 1) {
    return withTimestamps.map((e) => e.preset);
  }

  // Sort newest first — used ONLY for cluster identification, not for the
  // return order.
  const sorted = [...withTimestamps].sort((a, b) => b.ts - a.ts);

  // Walk from newest to oldest; split on gaps > gapMs
  const clusters: T[][] = [];
  let current: T[] = [sorted[0]!.preset];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gap = prev.ts - curr.ts; // prev is newer

    if (gap <= gapMs) {
      current.push(curr.preset);
    } else {
      clusters.push(current);
      current = [curr.preset];
    }
  }
  clusters.push(current);

  // Identify the newest cluster's members, then return them filtered from
  // the original input order (preserving the order of `withTimestamps`
  // rather than the sorted order).
  const newestCluster = clusters[0]!;
  const newestClusterIds = new Set(newestCluster.map((p) => p.docId));

  return withTimestamps.reduce<T[]>((latest, entry) => {
    if (newestClusterIds.has(entry.preset.docId)) {
      latest.push(entry.preset);
    }
    return latest;
  }, []);
}
