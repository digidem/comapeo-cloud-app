import { AUTHORED_VECTOR_LAYER_FIXTURE } from '@tests/fixtures/authored-layers';
import { describe, expect, it, vi } from 'vitest';

import { createAuthoredLayerFromGeoJsonOverlay } from '@/lib/map/authored-layer-factory';
import {
  type AuthoredLayerCommitContext,
  createGeoJsonAuthoredLayer,
  prepareAuthoredLayer,
} from '@/lib/map/authored-layers';

const context: AuthoredLayerCommitContext = { minZoom: 0, maxZoom: 14 };

function fixtureGeoJson() {
  if (AUTHORED_VECTOR_LAYER_FIXTURE.source.type !== 'geojson') {
    throw new Error('Expected canonical vector fixture to use GeoJSON');
  }
  return structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE.source.data);
}

describe('createAuthoredLayerFromGeoJsonOverlay', () => {
  it('normalizes polygon, line, and point paint to the #222 reference-overlay visuals', () => {
    const result = createAuthoredLayerFromGeoJsonOverlay(
      fixtureGeoJson(),
      context,
      { name: 'Imported territory' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.layer.render.layers).toEqual([
      {
        type: 'fill',
        filter: ['in', '$type', 'Polygon'],
        paint: { 'fill-color': '#E45D2A', 'fill-opacity': 0.16 },
      },
      {
        type: 'line',
        filter: ['in', '$type', 'Polygon'],
        paint: {
          'line-color': '#E45D2A',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      },
      {
        type: 'line',
        filter: ['in', '$type', 'LineString'],
        paint: {
          'line-color': '#E45D2A',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      },
      {
        type: 'circle',
        filter: ['in', '$type', 'Point'],
        paint: {
          'circle-color': '#E45D2A',
          'circle-radius': 5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 1.5,
        },
      },
    ]);
  });

  it('preserves input data, name, visibility, source data, and render order', () => {
    const input = fixtureGeoJson();
    const before = structuredClone(input);

    const result = createAuthoredLayerFromGeoJsonOverlay(input, context, {
      name: 'Custom layer',
      visible: false,
    });

    expect(input).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.layer.name).toBe('Custom layer');
    expect(result.layer.visible).toBe(false);
    expect(result.layer.source).toEqual({ type: 'geojson', data: before });
    expect(result.layer.render.layers.map((layer) => layer.type)).toEqual([
      'fill',
      'line',
      'line',
      'circle',
    ]);
  });

  it('returns a layer that still passes the canonical #279 prepare boundary', () => {
    const result = createAuthoredLayerFromGeoJsonOverlay(
      fixtureGeoJson(),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(prepareAuthoredLayer(result.layer, context)).toEqual({
      ok: true,
      layer: result.layer,
    });
  });

  it('propagates the #279 reserved-ID failure without producing a partial layer', () => {
    const reservedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(reservedId);
    const reservedContext: AuthoredLayerCommitContext = {
      minZoom: 0,
      maxZoom: 14,
      reservedIds: new Set([reservedId]),
    };
    const input = fixtureGeoJson();

    const direct = createGeoJsonAuthoredLayer(input, reservedContext);
    const result = createAuthoredLayerFromGeoJsonOverlay(
      input,
      reservedContext,
    );

    expect(direct.ok).toBe(false);
    expect(result).toEqual(direct);
    expect(result.ok).toBe(false);
  });
});
