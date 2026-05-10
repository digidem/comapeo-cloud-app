import { beforeEach, describe, expect, it } from 'vitest';

import {
  addAttachment,
  createAlert,
  createObservation,
  createProject,
  getAlerts,
  getObservations,
  getProjectPoints,
  getProjects,
  getSyncStatus,
  importGeoJsonPoints,
} from '@/lib/data-layer';
import { resetDb } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(async () => {
  await resetDb();
});

describe('data-layer', () => {
  describe('projects', () => {
    it('creates and reads local projects', async () => {
      const project = await createProject({ name: 'Test Project' });
      expect(project.localId).toBeDefined();
      expect(project.sourceType).toBe('local');
      expect(project.dirtyLocal).toBe(true);

      const projects = await getProjects();
      const found = projects.find((p) => p.localId === project.localId);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test Project');
    });

    it('returns empty array when no projects', async () => {
      const projects = await getProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('observations', () => {
    it('creates and reads observations scoped by project', async () => {
      const project = await createProject({ name: 'Proj' });
      const obs = await createObservation({
        projectLocalId: project.localId,
        tags: { species: 'test' },
      });

      expect(obs.localId).toBeDefined();
      expect(obs.projectLocalId).toBe(project.localId);

      const obsList = await getObservations(project.localId);
      expect(obsList).toHaveLength(1);
      expect(obsList[0]!.localId).toBe(obs.localId);
    });

    it('returns empty array when no observations', async () => {
      const project = await createProject({ name: 'P' });
      const obsList = await getObservations(project.localId);
      expect(obsList).toEqual([]);
    });
  });

  describe('alerts', () => {
    it('creates and reads alerts scoped by project', async () => {
      const project = await createProject({ name: 'Proj' });
      const alert = await createAlert({ projectLocalId: project.localId });

      expect(alert.localId).toBeDefined();
      expect(alert.projectLocalId).toBe(project.localId);

      const alertList = await getAlerts(project.localId);
      expect(alertList).toHaveLength(1);
      expect(alertList[0]!.localId).toBe(alert.localId);
    });

    it('returns empty array when no alerts', async () => {
      const project = await createProject({ name: 'P' });
      const alertList = await getAlerts(project.localId);
      expect(alertList).toEqual([]);
    });
  });

  describe('attachments', () => {
    it('adds an attachment reference', async () => {
      const project = await createProject({ name: 'P' });
      const obs = await createObservation({
        projectLocalId: project.localId,
      });
      const att = await addAttachment({
        projectLocalId: project.localId,
        observationLocalId: obs.localId,
      });

      expect(att.localId).toBeDefined();
      expect(att.observationLocalId).toBe(obs.localId);
    });
  });

  describe('sync status', () => {
    it('getSyncStatus returns the status object', () => {
      useAuthStore.setState({
        servers: [],
      });
      const status = getSyncStatus();
      expect(status).toHaveProperty('isSyncing');
      expect(status).toHaveProperty('lastSyncedAt');
      expect(status).toHaveProperty('errors');
    });

    it('getSyncStatus reflects syncing state from auth store', () => {
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Test',
            baseUrl: 'https://test.com',
            token: 'tok',
            status: 'syncing',
          },
        ],
      });
      const status = getSyncStatus();
      expect(status.isSyncing).toBe(true);
    });

    it('getSyncStatus returns lastSyncedAt from most recent server', () => {
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Old',
            baseUrl: 'https://old.com',
            token: 'tok',
            status: 'idle',
            lastSyncedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 's2',
            label: 'New',
            baseUrl: 'https://new.com',
            token: 'tok',
            status: 'idle',
            lastSyncedAt: '2024-06-01T00:00:00Z',
          },
        ],
      });
      const status = getSyncStatus();
      expect(status.lastSyncedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('getSyncStatus collects error messages from servers', () => {
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Err',
            baseUrl: 'https://err.com',
            token: 'tok',
            status: 'error',
            errorMessage: 'Connection refused',
          },
        ],
      });
      const status = getSyncStatus();
      expect(status.errors).toContain('Connection refused');
    });
  });

  describe('getProjectPoints', () => {
    it('returns FeatureCollection with points from observations', async () => {
      const project = await createProject({ name: 'P' });
      await createObservation({
        projectLocalId: project.localId,
        lat: 10,
        lon: 20,
      });
      await createObservation({
        projectLocalId: project.localId,
        lat: -30,
        lon: 40,
      });

      const fc = await getProjectPoints(project.localId);
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features).toHaveLength(2);
      const coords = fc.features.map((f) => f.geometry.coordinates);
      expect(coords).toContainEqual([20, 10]);
      expect(coords).toContainEqual([40, -30]);
    });

    it('filters out observations without lat/lon', async () => {
      const project = await createProject({ name: 'P' });
      await createObservation({ projectLocalId: project.localId });
      await createObservation({
        projectLocalId: project.localId,
        lat: 10,
        lon: 20,
      });

      const fc = await getProjectPoints(project.localId);
      expect(fc.features).toHaveLength(1);
    });

    it('filters out observations with invalid coords', async () => {
      const project = await createProject({ name: 'P' });
      await createObservation({
        projectLocalId: project.localId,
        lat: 999,
        lon: 20,
      });

      const fc = await getProjectPoints(project.localId);
      expect(fc.features).toHaveLength(0);
    });

    it('returns empty FeatureCollection when no observations', async () => {
      const project = await createProject({ name: 'P' });
      const fc = await getProjectPoints(project.localId);
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features).toEqual([]);
    });
  });

  describe('importGeoJsonPoints', () => {
    it('imports points from a GeoJSON file', async () => {
      const project = await createProject({ name: 'P' });
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10, 20] },
            properties: {},
          },
        ],
      });
      const file = new File([geojson], 'data.geojson', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('returns 0 imported for invalid JSON', async () => {
      const project = await createProject({ name: 'P' });
      const file = new File(['not json'], 'data.geojson', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('imports from a Feature (not FeatureCollection)', async () => {
      const project = await createProject({ name: 'P' });
      const geojson = JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [10, 20] },
        properties: {},
      });
      const file = new File([geojson], 'data.geojson', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(1);
    });

    it('imports from a bare Point geometry', async () => {
      const project = await createProject({ name: 'P' });
      const geojson = JSON.stringify({
        type: 'Point',
        coordinates: [10, 20],
      });
      const file = new File([geojson], 'data.json', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(1);
    });

    it('counts skipped when FeatureCollection has non-Point features', async () => {
      const project = await createProject({ name: 'P' });
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10, 20] },
            properties: {},
          },
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            properties: {},
          },
        ],
      });
      const file = new File([geojson], 'data.geojson', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(1);
      // LineString is not a Point/MultiPoint so candidateCount=1, imported=1, skipped=0
      expect(result.skipped).toBe(0);
    });

    it('handles MultiPoint geometry in FeatureCollection', async () => {
      const project = await createProject({ name: 'P' });
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'MultiPoint',
              coordinates: [
                [10, 20],
                [30, 40],
              ],
            },
            properties: {},
          },
        ],
      });
      const file = new File([geojson], 'data.geojson', {
        type: 'application/json',
      });

      const result = await importGeoJsonPoints(project.localId, file);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
    });
  });
});
