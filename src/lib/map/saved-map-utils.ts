import type { SavedMap } from '@/lib/db';

export type ImportedSmpMap = SavedMap & {
  type: 'style';
  styleUrl: '';
  status: 'ready';
  smpBlob: Blob;
};

/**
 * Imported SMP maps are self-contained ready style maps with no network style
 * URL. Centralize the predicate so render/download paths do not infer import
 * origin independently.
 */
export function isImportedSmpMap(
  map: SavedMap | null | undefined,
): map is ImportedSmpMap {
  return Boolean(
    map &&
    map.type === 'style' &&
    map.styleUrl === '' &&
    map.status === 'ready' &&
    map.smpBlob,
  );
}
