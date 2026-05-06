import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import type { Alert, Observation, Project } from '@/lib/db';

function makeId(): string {
  return crypto.randomUUID();
}

beforeEach(async () => {
  await resetDb();
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('local-repositories — projects', () => {
  it('creates a local project', async () => {
    const db = getDb();
    const project: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: true,
      deleted: false,
    };
    await db.projects.add(project);
    const retrieved = await db.projects.get(project.localId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.localId).toBe(project.localId);
    expect(retrieved!.sourceType).toBe('local');
    expect(retrieved!.dirtyLocal).toBe(true);
  });

  it('lists all local projects', async () => {
    const db = getDb();
    const p1: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    const p2: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.projects.bulkAdd([p1, p2]);
    const all = await db.projects.toArray();
    expect(all).toHaveLength(2);
  });

  it('updates a local project', async () => {
    const db = getDb();
    const project: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.projects.add(project);
    await db.projects.update(project.localId, {
      updatedAt: '2025-01-03T00:00:00Z',
    });
    const updated = await db.projects.get(project.localId);
    expect(updated!.updatedAt).toBe('2025-01-03T00:00:00Z');
  });

  it('deletes a local project', async () => {
    const db = getDb();
    const project: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.projects.add(project);
    await db.projects.delete(project.localId);
    const retrieved = await db.projects.get(project.localId);
    expect(retrieved).toBeUndefined();
  });

  it('source namespacing — local vs remote archive records coexist', async () => {
    const db = getDb();
    const localProject: Project = {
      localId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    const archiveProject: Project = {
      localId: makeId(),
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-proj-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };
    await db.projects.bulkAdd([localProject, archiveProject]);
    const allProjects = await db.projects.toArray();
    const localProjects = allProjects.filter((p) => p.sourceType === 'local');
    const archiveProjects = allProjects.filter(
      (p) => p.sourceType === 'remoteArchive',
    );
    expect(localProjects).toHaveLength(1);
    expect(archiveProjects).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

describe('local-repositories — observations', () => {
  it('creates observations scoped to a project', async () => {
    const db = getDb();
    const projectId = makeId();
    const obs: Observation = {
      localId: makeId(),
      projectLocalId: projectId,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.observations.add(obs);
    const retrieved = await db.observations.get(obs.localId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.projectLocalId).toBe(projectId);
  });

  it('lists observations scoped by projectLocalId', async () => {
    const db = getDb();
    const projectA = makeId();
    const projectB = makeId();
    const obsA1: Observation = {
      localId: makeId(),
      projectLocalId: projectA,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    const obsB1: Observation = {
      localId: makeId(),
      projectLocalId: projectB,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.observations.bulkAdd([obsA1, obsB1]);
    const projectAObs = await db.observations
      .where('projectLocalId')
      .equals(projectA)
      .toArray();
    expect(projectAObs).toHaveLength(1);
    expect(projectAObs[0]!.localId).toBe(obsA1.localId);
  });

  it('updates an observation', async () => {
    const db = getDb();
    const obs: Observation = {
      localId: makeId(),
      projectLocalId: makeId(),
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.observations.add(obs);
    await db.observations.update(obs.localId, { dirtyLocal: false });
    const updated = await db.observations.get(obs.localId);
    expect(updated!.dirtyLocal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

describe('local-repositories — alerts', () => {
  it('creates alerts scoped to a project', async () => {
    const db = getDb();
    const projectId = makeId();
    const alert: Alert = {
      localId: makeId(),
      projectLocalId: projectId,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.alerts.add(alert);
    const retrieved = await db.alerts.get(alert.localId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.projectLocalId).toBe(projectId);
  });

  it('lists alerts by projectLocalId', async () => {
    const db = getDb();
    const projectId = makeId();
    const al1: Alert = {
      localId: makeId(),
      projectLocalId: projectId,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    const al2: Alert = {
      localId: makeId(),
      projectLocalId: projectId,
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };
    await db.alerts.bulkAdd([al1, al2]);
    const alerts = await db.alerts
      .where('projectLocalId')
      .equals(projectId)
      .toArray();
    expect(alerts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Source namespacing
// ---------------------------------------------------------------------------

describe('source namespacing', () => {
  it('preserves remotePayload fields alongside source metadata', async () => {
    const db = getDb();

    // Store a local project with remote archive data
    const project: Project = {
      localId: makeId(),
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-proj-1',
      createdAt: '2025-06-01T00:00:00Z',
      updatedAt: '2025-06-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };
    await db.projects.add(project);

    const retrieved = await db.projects.get(project.localId);
    expect(retrieved!.sourceType).toBe('remoteArchive');
    expect(retrieved!.sourceId).toBe('server-1');
    expect(retrieved!.remoteId).toBe('remote-proj-1');
  });
});
