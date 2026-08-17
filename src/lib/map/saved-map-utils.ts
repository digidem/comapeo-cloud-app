import type { SavedMap } from '@/lib/db';

export type ImportedSmpRecord = SavedMap & {
  type: 'style';
  origin: 'imported';
  styleUrl: '';
};

export type ImportedSmpMap = ImportedSmpRecord & {
  status: 'ready';
  smpBlob: Blob;
};

/** Imported SMP records carry an explicit origin marker and no network style URL. */
export function isImportedSmpRecord(
  map: SavedMap | null | undefined,
): map is ImportedSmpRecord {
  return Boolean(
    map &&
    map.origin === 'imported' &&
    map.type === 'style' &&
    map.styleUrl === '',
  );
}

/**
 * Legacy/runtime helper for callers that already hold a fully hydrated Blob.
 * Current persisted imported maps normally keep package bytes in the separate
 * package/chunk tables and should use `isImportedSmpRecord` plus a package reader.
 */
export function isImportedSmpMap(
  map: SavedMap | null | undefined,
): map is ImportedSmpMap {
  return Boolean(
    isImportedSmpRecord(map) && map.status === 'ready' && map.smpBlob,
  );
}
