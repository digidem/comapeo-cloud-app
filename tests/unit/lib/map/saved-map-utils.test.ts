import { describe, expect, it } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { isImportedSmpMap } from '@/lib/map/saved-map-utils';

const importedMap: SavedMap = {
  id: 'imported-map',
  projectLocalId: 'project-1',
  name: 'Imported map',
  type: 'style',
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

describe('isImportedSmpMap', () => {
  it('recognizes self-contained ready imported style maps', () => {
    expect(isImportedSmpMap(importedMap)).toBe(true);
  });

  it.each([
    ['authored style URL', { styleUrl: 'https://example.com/style.json' }],
    ['non-ready status', { status: 'draft' as const }],
    ['missing SMP blob', { smpBlob: undefined }],
    ['raster type', { type: 'raster' as const, styleUrl: '' }],
  ])('rejects %s', (_label, patch) => {
    expect(isImportedSmpMap({ ...importedMap, ...patch })).toBe(false);
  });
});
