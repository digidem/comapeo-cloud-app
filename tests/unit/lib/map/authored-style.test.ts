import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import { describe, expect, it } from 'vitest';

import {
  MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED,
  MAX_FINAL_STYLE_BYTES,
  fragmentLayerIdForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';
import {
  type MapLibreStyleLike,
  composeAuthoredStyle,
  createAuthoredOnlyStyle,
} from '@/lib/map/authored-style';

const MAP = {
  bbox: [-75, -12, -45, 8] as [number, number, number, number],
  minZoom: 0,
  maxZoom: 8,
};

function baseStyle(): MapLibreStyleLike {
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: 'raster',
        tiles: ['smp://maps.v1/s/0/{z}/{x}/{y}.png'],
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    metadata: { 'smp:sourceFolders': { basemap: 's/0' } },
  };
}

describe('composeAuthoredStyle', () => {
  it('appends authored fragments after basemap in exact outer/inner order', () => {
    const result = composeAuthoredStyle({
      baseStyle: baseStyle(),
      authoredLayers: [
        AUTHORED_VECTOR_LAYER_FIXTURE,
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      map: MAP,
    });
    expect(result.style.layers.map((layer) => layer.id)).toEqual([
      'basemap',
      ...AUTHORED_VECTOR_LAYER_FIXTURE.render.layers.map((_fragment, index) =>
        fragmentLayerIdForAuthoredLayer(
          AUTHORED_VECTOR_LAYER_FIXTURE.id,
          index,
        ),
      ),
      ...AUTHORED_RASTER_LAYER_FIXTURE.render.layers.map((_fragment, index) =>
        fragmentLayerIdForAuthoredLayer(
          AUTHORED_RASTER_LAYER_FIXTURE.id,
          index,
        ),
      ),
    ]);
  });

  it('keeps vector GeoJSON inline and derives runtime source IDs', () => {
    const result = composeAuthoredStyle({
      baseStyle: baseStyle(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    const sourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_VECTOR_LAYER_FIXTURE.id,
    );
    if (AUTHORED_VECTOR_LAYER_FIXTURE.source.type !== 'geojson') {
      throw new Error('vector fixture must be geojson');
    }
    expect(result.style.sources[sourceId]).toEqual({
      type: 'geojson',
      data: AUTHORED_VECTOR_LAYER_FIXTURE.source.data,
    });
    expect(result.style.layers.at(-1)?.source).toBe(sourceId);
  });

  it('applies outer hidden visibility to every generated fragment without dropping payloads', () => {
    const result = composeAuthoredStyle({
      baseStyle: baseStyle(),
      authoredLayers: [
        AUTHORED_VECTOR_LAYER_FIXTURE,
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      map: MAP,
    });
    const authored = result.style.layers.slice(1);
    expect(authored).toHaveLength(5);
    for (const fragment of authored) {
      expect(
        (fragment.layout as Record<string, unknown> | undefined)?.visibility,
      ).toBe('none');
    }
    expect(Object.keys(result.style.sources)).toHaveLength(3);
  });

  it('sets visible outer layers to explicit layout.visibility visible', () => {
    const visible = { ...AUTHORED_VECTOR_LAYER_FIXTURE, visible: true };
    const result = composeAuthoredStyle({
      baseStyle: baseStyle(),
      authoredLayers: [visible],
      map: MAP,
    });
    for (const fragment of result.style.layers.slice(1)) {
      expect(
        (fragment.layout as Record<string, unknown> | undefined)?.visibility,
      ).toBe('visible');
    }
  });

  it('rejects a basemap source or layer using the reserved authored prefix', () => {
    const sourceCollision = baseStyle();
    sourceCollision.sources = {
      ...sourceCollision.sources,
      [sourceLayerIdForAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE.id)]: {
        type: 'raster',
        tiles: ['smp://maps.v1/s/evil/{z}/{x}/{y}.png'],
      },
    };
    expect(() =>
      composeAuthoredStyle({
        baseStyle: sourceCollision,
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        map: MAP,
      }),
    ).toThrow(/collision|reserved/i);

    const layerCollision = baseStyle();
    layerCollision.layers = [
      ...layerCollision.layers,
      {
        id: fragmentLayerIdForAuthoredLayer(
          AUTHORED_VECTOR_LAYER_FIXTURE.id,
          0,
        ),
        type: 'background',
      },
    ];
    expect(() =>
      composeAuthoredStyle({
        baseStyle: layerCollision,
        authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
        map: MAP,
      }),
    ).toThrow(/collision|reserved/i);
  });

  it('measures base and prospective final style before any whole-style serialization', () => {
    const result = composeAuthoredStyle({
      baseStyle: baseStyle(),
      authoredLayers: [AUTHORED_VECTOR_LAYER_FIXTURE],
      map: MAP,
    });
    expect(result.baseStyleUtf8Bytes).toBeGreaterThan(0n);
    expect(result.baseStyleUtf8Bytes).toBeLessThanOrEqual(
      BigInt(MAX_BASE_STYLE_JSON_BYTES_FOR_AUTHORED),
    );
    expect(result.finalStyleUtf8Bytes).toBeGreaterThan(
      result.baseStyleUtf8Bytes,
    );
    expect(result.finalStyleUtf8Bytes).toBeLessThanOrEqual(
      BigInt(MAX_FINAL_STYLE_BYTES),
    );
  });

  it('advertises only the effective raster zoom range that will actually be packaged', () => {
    const result = createAuthoredOnlyStyle({
      authoredLayers: [AUTHORED_RASTER_LAYER_FIXTURE],
      map: { ...MAP, minZoom: 3, maxZoom: 6 },
    });
    const sourceId = sourceLayerIdForAuthoredLayer(
      AUTHORED_RASTER_LAYER_FIXTURE.id,
    );
    expect(result.style.sources[sourceId]).toMatchObject({
      minzoom: 3,
      maxzoom: 6,
    });
  });

  it('creates an authored-only Writer style with no basemap/global sources', () => {
    const result = createAuthoredOnlyStyle({
      authoredLayers: [
        AUTHORED_VECTOR_LAYER_FIXTURE,
        AUTHORED_RASTER_LAYER_FIXTURE,
      ],
      map: MAP,
    });
    expect(Object.keys(result.style.sources)).toEqual([
      sourceLayerIdForAuthoredLayer(AUTHORED_VECTOR_LAYER_FIXTURE.id),
      sourceLayerIdForAuthoredLayer(AUTHORED_RASTER_LAYER_FIXTURE.id),
    ]);
    expect(result.style.layers).toHaveLength(5);
    expect(result.rasterLayerIds).toEqual([AUTHORED_RASTER_LAYER_FIXTURE.id]);
  });
});
