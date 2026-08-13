import { describe, expect, it } from 'vitest';

import {
  alertsToFeatureCollection,
  getAlertGeometryBounds,
} from '@/lib/alert-geometry';
import type { Alert } from '@/lib/data-layer';

function makeAlert(localId: string, geometry?: Alert['geometry']): Alert {
  return {
    localId,
    projectLocalId: 'project-1',
    sourceType: 'local',
    sourceId: 'source-1',
    geometry,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
  };
}

const geometries = [
  { type: 'Point', coordinates: [-60, -3] },
  {
    type: 'MultiPoint',
    coordinates: [
      [-61, -4],
      [-62, -5],
    ],
  },
  {
    type: 'LineString',
    coordinates: [
      [-63, -6],
      [-64, -7],
    ],
  },
  {
    type: 'MultiLineString',
    coordinates: [
      [
        [-65, -8],
        [-66, -9],
      ],
      [
        [-67, -10],
        [-68, -11],
      ],
    ],
  },
  {
    type: 'Polygon',
    coordinates: [
      [
        [-69, -12],
        [-70, -12],
        [-70, -13],
        [-69, -12],
      ],
    ],
  },
  {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-71, -14],
          [-72, -14],
          [-72, -15],
          [-71, -14],
        ],
      ],
      [
        [
          [-73, -16],
          [-74, -16],
          [-74, -17],
          [-73, -16],
        ],
      ],
    ],
  },
] satisfies NonNullable<Alert['geometry']>[];

describe('alert geometry conversion', () => {
  it('keeps all six supported GeoJSON geometry families', () => {
    const collection = alertsToFeatureCollection(
      geometries.map((geometry, index) =>
        makeAlert(`alert-${index + 1}`, geometry),
      ),
    );

    expect(collection.features.map((feature) => feature.geometry.type)).toEqual(
      [
        'Point',
        'MultiPoint',
        'LineString',
        'MultiLineString',
        'Polygon',
        'MultiPolygon',
      ],
    );
    expect(
      collection.features.map((feature) => feature.properties.alertId),
    ).toEqual([
      'alert-1',
      'alert-2',
      'alert-3',
      'alert-4',
      'alert-5',
      'alert-6',
    ]);
  });

  it.each([
    undefined,
    { type: 'GeometryCollection', coordinates: [] },
    { type: 'Point', coordinates: [181, 0] },
    { type: 'Point', coordinates: [0, Number.NaN] },
    { type: 'LineString', coordinates: [[0, 0]] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    },
    { type: 'MultiPolygon', coordinates: [] },
  ])('safely skips invalid or missing geometry %#', (geometry) => {
    const collection = alertsToFeatureCollection([
      makeAlert('invalid', geometry as Alert['geometry']),
    ]);

    expect(collection.features).toEqual([]);
  });

  it('calculates the full meaningful extent across valid geometries only', () => {
    const collection = alertsToFeatureCollection([
      makeAlert('point', { type: 'Point', coordinates: [-55, -8] }),
      makeAlert('line', {
        type: 'LineString',
        coordinates: [
          [-72, -15],
          [-48, 2],
        ],
      }),
      makeAlert('invalid', { type: 'Point', coordinates: [999, 999] }),
    ]);

    expect(getAlertGeometryBounds(collection)).toEqual([
      [-72, -15],
      [-48, 2],
    ]);
  });

  it('returns no extent for a collection without valid geometry', () => {
    expect(
      getAlertGeometryBounds(alertsToFeatureCollection([makeAlert('none')])),
    ).toBeUndefined();
  });
});
