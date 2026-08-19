import type { SavedMap } from '@/lib/db';

export type ImportedSmpRecord = SavedMap & {
  type: 'style';
  origin: 'imported';
  styleUrl: '';
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
