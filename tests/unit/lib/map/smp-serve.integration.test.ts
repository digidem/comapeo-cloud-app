import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  closeSmpReader,
  getSmpReader,
  resolveSmpStyle,
  sanitizeImportedSmpStyle,
} from '@/lib/map/smp-serve';

async function buildSyntheticSmp(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('VERSION', '1.0');
  zip.file(
    'style.json',
    JSON.stringify({
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 4,
          bounds: [-75, -12, -45, 8],
        },
      },
      layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
      metadata: {
        'smp:bounds': [-75, -12, -45, 8],
        'smp:maxzoom': 4,
        'smp:sourceFolders': { raster: 's/0' },
      },
    }),
  );
  zip.file('s/0/0/0/0.png', new Uint8Array([1, 2, 3]));
  return zip.generateAsync({ type: 'blob' });
}

describe('SMP reader integration', () => {
  it('resolves a synthetic packaged SMP into an offline-safe render style', async () => {
    const mapId = 'synthetic-import';
    const reader = await getSmpReader(mapId, await buildSyntheticSmp());

    try {
      const style = await resolveSmpStyle(reader, mapId);
      expect(style).not.toBeNull();
      expect(sanitizeImportedSmpStyle(style!)).not.toBeNull();
      expect(
        (style!.sources.raster as { tiles?: string[] }).tiles?.[0],
      ).toMatch(/^smp:\/\/\/synthetic-import\//);
    } finally {
      await closeSmpReader(mapId);
    }
  });
});
