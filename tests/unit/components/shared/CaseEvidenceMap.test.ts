import { describe, expect, it } from 'vitest';

import {
  buildCaseEvidenceFeatureCollection,
  getCaseEvidenceInitialViewState,
} from '@/components/shared/CaseEvidenceMap';
import type { Alert, Observation, Track } from '@/lib/data-layer';
import type { CaseEvidenceReference } from '@/lib/db';

const reference = (
  sourceType: CaseEvidenceReference['sourceType'],
  sourceLocalId: string,
): CaseEvidenceReference => ({
  localId: `evidence-${sourceLocalId}`,
  caseLocalId: 'case-1',
  projectLocalId: 'project-1',
  sourceType,
  sourceLocalId,
  sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
  addedAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('CaseEvidenceMap geometry', () => {
  it('builds only selected observation, alert, and valid track features', () => {
    const observations = [
      {
        localId: 'obs-1',
        lon: -60.1,
        lat: -3.1,
      },
      {
        localId: 'obs-invalid',
        lon: Number.NaN,
        lat: -3.4,
      },
    ] as Observation[];
    const alerts = [
      {
        localId: 'alert-1',
        geometry: { type: 'Polygon', coordinates: [[[-60.2, -3.2]]] },
      },
    ] as Alert[];
    const tracks = [
      {
        localId: 'track-1',
        locations: [
          { coords: { longitude: -60.3, latitude: -3.3 } },
          { coords: { longitude: -60.4, latitude: -3.4 } },
        ],
      },
      {
        localId: 'track-short',
        locations: [{ coords: { longitude: -61, latitude: -4 } }],
      },
    ] as Track[];

    const collection = buildCaseEvidenceFeatureCollection({
      evidence: [
        reference('observation', 'obs-1'),
        reference('observation', 'obs-invalid'),
        reference('alert', 'alert-1'),
        reference('track', 'track-1'),
        reference('track', 'track-short'),
        reference('alert', 'missing-alert'),
      ],
      observations,
      alerts,
      tracks,
    });

    expect(collection.features).toHaveLength(3);
    expect(collection.features.map((feature) => feature.geometry.type)).toEqual(
      ['Point', 'Polygon', 'LineString'],
    );
    expect(collection.features.map((feature) => feature.properties)).toEqual([
      { sourceType: 'observation', sourceLocalId: 'obs-1' },
      { sourceType: 'alert', sourceLocalId: 'alert-1' },
      { sourceType: 'track', sourceLocalId: 'track-1' },
    ]);
  });

  it('centers on the first usable nested geometry and otherwise uses the fallback view', () => {
    expect(
      getCaseEvidenceInitialViewState({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'GeometryCollection',
              geometries: [
                { type: 'LineString', coordinates: [] },
                { type: 'Point', coordinates: [-62.5, -4.25] },
              ],
            },
          },
        ],
      }),
    ).toEqual({ longitude: -62.5, latitude: -4.25, zoom: 10 });

    expect(
      getCaseEvidenceInitialViewState({
        type: 'FeatureCollection',
        features: [],
      }),
    ).toEqual({ longitude: -60, latitude: -3, zoom: 4 });
  });
});
