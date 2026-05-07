import { beforeEach, describe, expect, it } from 'vitest';

import {
  addAttachment,
  createAlert,
  createObservation,
  createProject,
  getAlerts,
  getObservations,
  getProjects,
  getSyncStatus,
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
  });
});
