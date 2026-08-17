import { describe, expect, it } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { isImportedSmpRecord } from '@/lib/map/saved-map-utils';

const importedMap: SavedMap = {
  id: 'imported-map',
  projectLocalId: 'project-1',
  name: 'Imported map',
  type: 'style',
  origin: 'imported',
  styleUrl: '',
  bbox: [-70, -5, -60, 2],
  minZoom: 0,
  maxZoom: 14,
  status: 'ready',
  smpBlob: new Blob(['smp']),
  smpSize: 3,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
};

describe('isImportedSmpRecord', () => {
  it('recognizes imported origin even when the packaged blob is missing', () => {
    expect(isImportedSmpRecord({ ...importedMap, smpBlob: undefined })).toBe(
      true,
    );
  });

  it('rejects authored style records', () => {
    expect(
      isImportedSmpRecord({
        ...importedMap,
        origin: 'authored',
        styleUrl: 'https://example.com/style.json',
      }),
    ).toBe(false);
  });
});
