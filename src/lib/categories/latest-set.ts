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

  // Parse createdAt; drop unparseable timestamps
  const withTimestamps = active
    .map((preset) => {
      const ts = parseTimestamp(preset.createdAt);
      return ts !== null ? ({ preset, ts } as const) : null;
    })
    .filter(
      (entry): entry is { readonly preset: T; readonly ts: number } =>
        entry !== null,
    );

  // Sort newest first
  withTimestamps.sort((a, b) => b.ts - a.ts);

  if (withTimestamps.length <= 1) {
    return withTimestamps.map((e) => e.preset);
  }

  // Walk from newest to oldest; split on gaps > gapMs
  const clusters: T[][] = [];
  let current: T[] = [withTimestamps[0]!.preset];

  for (let i = 1; i < withTimestamps.length; i++) {
    const prev = withTimestamps[i - 1]!;
    const curr = withTimestamps[i]!;
    const gap = prev.ts - curr.ts; // prev is newer

    if (gap <= gapMs) {
      current.push(curr.preset);
    } else {
      clusters.push(current);
      current = [curr.preset];
    }
  }
  clusters.push(current);

  // Return the newest cluster (first one)
  return clusters[0]!;
}
