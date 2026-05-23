import { describe, expect, it } from 'vitest';

import type { Observation } from '@/lib/data-layer';
import {
  buildExportFilename,
  observationsToCsv,
  observationsToGeoJson,
  slugifyProjectName,
} from '@/lib/observation-export';

// --- Helpers ---

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'local-1',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

// --- slugifyProjectName ---

describe('slugifyProjectName', () => {
  it('returns lowercased, hyphenated slug for a normal name', () => {
    expect(slugifyProjectName('My Test Project')).toBe('my-test-project');
  });

  it('returns "project" for undefined name', () => {
    expect(slugifyProjectName(undefined)).toBe('project');
  });

  it('returns "project" for empty string', () => {
    expect(slugifyProjectName('')).toBe('project');
  });

  it('strips special characters', () => {
    expect(slugifyProjectName('Projeto #1!')).toBe('projeto-1');
  });

  it('collapses multiple hyphens', () => {
    expect(slugifyProjectName('Hello   World')).toBe('hello-world');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugifyProjectName(' -- Test -- ')).toBe('test');
  });
});

// --- buildExportFilename ---

describe('buildExportFilename', () => {
  it('builds a geojson filename with date', () => {
    const date = new Date('2024-06-15');
    expect(buildExportFilename('My Project', 'geojson', date)).toBe(
      'my-project-observations-2024-06-15.geojson',
    );
  });

  it('builds a csv filename with date', () => {
    const date = new Date('2024-06-15');
    expect(buildExportFilename('My Project', 'csv', date)).toBe(
      'my-project-observations-2024-06-15.csv',
    );
  });

  it('uses today date when no date provided', () => {
    const filename = buildExportFilename('Test', 'geojson');
    // Should match pattern: test-observations-YYYY-MM-DD.geojson
    expect(filename).toMatch(/^test-observations-\d{4}-\d{2}-\d{2}\.geojson$/);
  });

  it('uses "project" fallback for undefined name', () => {
    const date = new Date('2024-01-01');
    expect(buildExportFilename(undefined, 'csv', date)).toBe(
      'project-observations-2024-01-01.csv',
    );
  });
});

// --- observationsToGeoJson ---

describe('observationsToGeoJson', () => {
  it('returns a valid FeatureCollection with Point geometry', () => {
    const obs = makeObservation({ lat: -8.35, lon: -55.45 });
    const fc = observationsToGeoJson([obs]);

    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);

    const feature = fc.features[0]!;
    expect(feature.type).toBe('Feature');
    expect(feature.geometry).toEqual({
      type: 'Point',
      coordinates: [-55.45, -8.35],
    });
  });

  it('spreads tags into properties with docId, createdAt, updatedAt', () => {
    const obs = makeObservation({
      lat: 10,
      lon: 20,
      tags: { category: 'forest', notes: 'test' },
    });
    const fc = observationsToGeoJson([obs]);
    const props = fc.features[0]!.properties;

    expect(props).toMatchObject({
      category: 'forest',
      notes: 'test',
      docId: 'obs-1',
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T10:30:00Z',
    });
  });

  it('uses null geometry when lat is missing', () => {
    const obs = makeObservation({ lon: -55.45 });
    const fc = observationsToGeoJson([obs]);

    expect(fc.features[0]!.geometry).toBeNull();
  });

  it('uses null geometry when lon is missing', () => {
    const obs = makeObservation({ lat: -8.35 });
    const fc = observationsToGeoJson([obs]);

    expect(fc.features[0]!.geometry).toBeNull();
  });

  it('uses null geometry when both coords are missing', () => {
    const obs = makeObservation({});
    const fc = observationsToGeoJson([obs]);

    expect(fc.features[0]!.geometry).toBeNull();
  });

  it('uses null geometry for out-of-range coords', () => {
    const obs = makeObservation({ lat: 91, lon: 0 });
    const fc = observationsToGeoJson([obs]);

    expect(fc.features[0]!.geometry).toBeNull();
  });

  it('uses null geometry for NaN coords', () => {
    const obs = makeObservation({ lat: NaN, lon: NaN });
    const fc = observationsToGeoJson([obs]);

    expect(fc.features[0]!.geometry).toBeNull();
  });

  it('handles empty tags by using empty object', () => {
    const obs = makeObservation({ lat: 0, lon: 0 });
    const fc = observationsToGeoJson([obs]);
    const props = fc.features[0]!.properties;

    expect(props).toMatchObject({
      docId: 'obs-1',
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T10:30:00Z',
    });
    // Should not have any tag keys beyond the canonical ones
    expect(Object.keys(props!).length).toBe(3);
  });

  it('returns empty features array for empty observations', () => {
    const fc = observationsToGeoJson([]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(0);
  });

  it('canonical keys win over tag collisions', () => {
    const obs = makeObservation({
      lat: 0,
      lon: 0,
      tags: { docId: 'should-be-overridden' },
    });
    const fc = observationsToGeoJson([obs]);
    const props = fc.features[0]!.properties;

    expect(props!.docId).toBe('obs-1');
  });

  it('handles multiple observations', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: 1, lon: 2 }),
      makeObservation({ localId: 'obs-2', lat: 3, lon: 4 }),
    ];
    const fc = observationsToGeoJson(observations);

    expect(fc.features).toHaveLength(2);
  });
});

// --- observationsToCsv ---

describe('observationsToCsv', () => {
  it('produces header row with all columns', () => {
    const csv = observationsToCsv([]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'docId,category,lat,lon,createdAt,updatedAt,tags,photoUrls',
    );
  });

  it('produces data row with all fields populated', () => {
    const obs = makeObservation({
      lat: -8.35,
      lon: -55.45,
      tags: {
        category: 'forest',
        photoUrls: 'https://example.com/photo1.jpg',
      },
    });
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain('obs-1');
    expect(lines[1]).toContain('forest');
    expect(lines[1]).toContain('-8.35');
    expect(lines[1]).toContain('-55.45');
    expect(lines[1]).toContain('2024-03-15T10:30:00Z');
  });

  it('leaves lat/lon empty when coords are missing', () => {
    const obs = makeObservation({});
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');
    const fields = lines[1]!.split(',');

    // lat is field index 2, lon is field index 3
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });

  it('serializes tags as JSON string', () => {
    const obs = makeObservation({ tags: { category: 'forest' } });
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');

    // The tags JSON will be CSV-escaped (quotes doubled)
    expect(lines[1]).toContain('{""category"":""forest""}');
  });

  it('handles undefined tags as empty JSON object', () => {
    const obs = makeObservation();
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('{}');
  });

  it('quotes fields containing commas', () => {
    const obs = makeObservation({
      tags: { notes: 'has,comma' },
    });
    const csv = observationsToCsv([obs]);

    // The tags JSON will contain a comma, so the whole field is quoted with doubled inner quotes
    expect(csv).toContain('"{""notes"":""has,comma""}"');
  });

  it('escapes double quotes inside fields', () => {
    const obs = makeObservation({
      tags: { notes: 'has "quotes"' },
    });
    const csv = observationsToCsv([obs]);

    // JSON.stringify produces backslash-escaped quotes, CSV escaper doubles surrounding "
    // Actual output: "{""notes"":""has \""quotes\""""}"
    expect(csv).toContain('""notes""');
    // The backslash-escaped quotes from JSON.stringify are preserved
    expect(csv).toMatch(/\\"/);
  });

  it('handles photoUrls field from tags', () => {
    const obs = makeObservation({
      tags: {
        photoUrls:
          'https://example.com/photo1.jpg,https://example.com/photo2.jpg',
      },
    });
    const csv = observationsToCsv([obs]);

    // photoUrls contains commas, should be quoted
    expect(csv).toContain('photo1.jpg');
  });

  it('handles empty observations (header only)', () => {
    const csv = observationsToCsv([]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      'docId,category,lat,lon,createdAt,updatedAt,tags,photoUrls',
    );
  });

  it('handles category from tags', () => {
    const obs = makeObservation({ tags: { category: 'water' } });
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');
    const fields = lines[1]!.split(',');

    // category is field index 1
    expect(fields[1]).toBe('water');
  });

  it('leaves category empty when not in tags', () => {
    const obs = makeObservation({ tags: { notes: 'something' } });
    const csv = observationsToCsv([obs]);
    const lines = csv.split('\n');
    const fields = lines[1]!.split(',');

    expect(fields[1]).toBe('');
  });

  it('handles multiple observations', () => {
    const observations = [
      makeObservation({ localId: 'obs-1' }),
      makeObservation({ localId: 'obs-2' }),
    ];
    const csv = observationsToCsv(observations);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(3); // header + 2 data rows
  });
});
