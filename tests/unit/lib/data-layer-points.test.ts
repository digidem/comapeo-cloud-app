import { beforeEach, describe, expect, it } from 'vitest';

import { getProjectPoints, importGeoJsonPoints } from '@/lib/data-layer';
import { resetDb } from '@/lib/db';
import { createObservation, createProject } from '@/lib/local-repositories';

beforeEach(async () => {
  await resetDb();
});

describe('getProjectPoints', () => {
  it('returns only observations with valid lat/lon', async () => {
    const project = await createProject({ name: 'Test' });

    await createObservation({
      projectLocalId: project.localId,
      lat: -3.1,
      lon: -60.5,
    });
    await createObservation({
      projectLocalId: project.localId,
      lat: -4.2,
      lon: -61.3,
    });
    await createObservation({ projectLocalId: project.localId });

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection.type).toBe('FeatureCollection');
    expect(featureCollection.features).toHaveLength(2);
    expect(featureCollection.features[0]!.geometry.type).toBe('Point');
    const coords = featureCollection.features.map(
      (p) => p.geometry.coordinates,
    );
    expect(coords).toContainEqual([-60.5, -3.1]);
    expect(coords).toContainEqual([-61.3, -4.2]);
  });

  it('excludes deleted observations', async () => {
    const project = await createProject({ name: 'Test' });
    const obs = await createObservation({
      projectLocalId: project.localId,
      lat: 1,
      lon: 2,
    });

    const { getDb } = await import('@/lib/db');
    const db = getDb();
    await db.observations.update(obs.localId, { deleted: true });

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection).toMatchObject({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('returns empty array when no observations have coordinates', async () => {
    const project = await createProject({ name: 'Test' });
    await createObservation({
      projectLocalId: project.localId,
      tags: { note: 'no coords' },
    });

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection.features).toHaveLength(0);
  });

  it('filters out observations with invalid coordinate bounds', async () => {
    const project = await createProject({ name: 'Test' });

    await createObservation({
      projectLocalId: project.localId,
      lat: -3.1,
      lon: -60.5,
    });
    await createObservation({
      projectLocalId: project.localId,
      lat: 91,
      lon: -60.5,
    });
    await createObservation({
      projectLocalId: project.localId,
      lat: -3.1,
      lon: 181,
    });
    await createObservation({
      projectLocalId: project.localId,
      lat: -91,
      lon: 0,
    });

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection.features).toHaveLength(1);
    expect(featureCollection.features[0]!.geometry.coordinates).toEqual([
      -60.5, -3.1,
    ]);
  });

  it('filters out non-finite coordinates', async () => {
    const project = await createProject({ name: 'Test' });

    await createObservation({
      projectLocalId: project.localId,
      lat: -3.1,
      lon: -60.5,
    });

    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const all = await db.observations.toArray();
    const withNaN = all.find((o) => o.lat === -3.1);
    if (withNaN) {
      await db.observations.update(withNaN.localId, { lat: NaN });
    }

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection.features).toHaveLength(0);
  });
});

describe('importGeoJsonPoints', () => {
  it('parses a GeoJSON file and creates observations', async () => {
    const project = await createProject({ name: 'Test' });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-60.5, -3.1] },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-61.0, -4.0] },
          properties: {},
        },
      ],
    });
    const file = new File([geojson], 'points.geojson', {
      type: 'application/geo+json',
    });

    const result = await importGeoJsonPoints(project.localId, file);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const featureCollection = await getProjectPoints(project.localId);
    expect(featureCollection.features).toHaveLength(2);
  });

  it('skips features with invalid coordinates', async () => {
    const project = await createProject({ name: 'Test' });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-60.5, -3.1] },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [200, 100] },
          properties: {},
        },
      ],
    });
    const file = new File([geojson], 'points.geojson', {
      type: 'application/geo+json',
    });

    const result = await importGeoJsonPoints(project.localId, file);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('returns zero counts for empty GeoJSON', async () => {
    const project = await createProject({ name: 'Test' });

    const geojson = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const file = new File([geojson], 'empty.geojson', {
      type: 'application/geo+json',
    });

    const result = await importGeoJsonPoints(project.localId, file);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('handles a .json file with GeoJSON content', async () => {
    const project = await createProject({ name: 'Test' });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-60.5, -3.1] },
          properties: {},
        },
      ],
    });
    const file = new File([geojson], 'points.json', {
      type: 'application/json',
    });

    const result = await importGeoJsonPoints(project.localId, file);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('handles a ZIP file containing a .geojson file', async () => {
    const project = await createProject({ name: 'Test' });

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-60.5, -3.1] },
          properties: {},
        },
      ],
    });
    zip.file('data.geojson', geojson);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const file = new File([zipBlob], 'archive.zip', {
      type: 'application/zip',
    });

    const result = await importGeoJsonPoints(project.localId, file);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('returns zero counts for malformed ZIP files', async () => {
    const project = await createProject({ name: 'Test' });
    const file = new File(['not a zip'], 'archive.zip', {
      type: 'application/zip',
    });

    await expect(importGeoJsonPoints(project.localId, file)).resolves.toEqual({
      imported: 0,
      skipped: 0,
    });
  });
});
