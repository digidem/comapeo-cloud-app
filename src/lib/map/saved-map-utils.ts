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

/** A renderable imported SMP additionally has a ready packaged blob. */
export function isImportedSmpMap(
  map: SavedMap | null | undefined,
): map is ImportedSmpMap {
  return Boolean(
    isImportedSmpRecord(map) && map.status === 'ready' && map.smpBlob,
  );
}
