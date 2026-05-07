import { beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from '@/lib/db';
import {
  createAlert,
  createAttachment,
  createObservation,
  createProject,
  createRemoteServer,
  deleteAlert,
  deleteObservation,
  deleteProject,
  deleteRemoteServer,
  getAlert,
  getAlerts,
  getAttachments,
  getObservation,
  getObservations,
  getProject,
  getProjects,
  getRemoteServer,
  getRemoteServerByBaseUrl,
  getRemoteServers,
  getSyncMetadata,
  updateAlert,
  updateObservation,
  updateProject,
  updateRemoteServer,
  upsertSyncMetadata,
} from '@/lib/local-repositories';

beforeEach(async () => {
  await resetDb();
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('local-repositories functions — projects', () => {
  it('createProject — creates a project with a name', async () => {
    const project = await createProject({ name: 'Test Project' });
    expect(project.localId).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.sourceType).toBe('local');
    expect(project.sourceId).toBe('local');
    expect(project.dirtyLocal).toBe(true);
    expect(project.deleted).toBe(false);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
  });

  it('createProject — creates a project without a name', async () => {
    const project = await createProject({});
    expect(project.localId).toBeDefined();
    expect(project.name).toBeUndefined();
  });

  it('getProjects — returns all projects', async () => {
    const p1 = await createProject({ name: 'Alpha' });
    const p2 = await createProject({ name: 'Beta' });
    const all = await getProjects();
    expect(all).toHaveLength(2);
    const ids = all.map((p) => p.localId);
    expect(ids).toContain(p1.localId);
    expect(ids).toContain(p2.localId);
  });

  it('getProject — returns a project by localId', async () => {
    const created = await createProject({ name: 'FindMe' });
    const found = await getProject(created.localId);
    expect(found).toBeDefined();
    expect(found!.name).toBe('FindMe');
  });

  it('getProject — returns undefined for non-existent id', async () => {
    const found = await getProject('does-not-exist');
    expect(found).toBeUndefined();
  });

  it('updateProject — updates name and changes updatedAt', async () => {
    const created = await createProject({ name: 'Original' });
    const originalUpdatedAt = created.updatedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));

    const updated = await updateProject(created.localId, { name: 'Updated' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated');
    expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('excludes soft-deleted projects from getProjects', async () => {
    await createProject({ name: 'Active' });
    const p2 = await createProject({ name: 'Deleted' });
    await updateProject(p2.localId, { deleted: true });
    const projects = await getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe('Active');
  });

  it('deleteProject — removes the project', async () => {
    const created = await createProject({ name: 'ToDelete' });
    await deleteProject(created.localId);
    const found = await getProject(created.localId);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

describe('local-repositories functions — observations', () => {
  it('createObservation — creates with tags', async () => {
    const project = await createProject({ name: 'ObsProject' });
    const obs = await createObservation({
      projectLocalId: project.localId,
      tags: { species: 'jaguar', location: 'forest' },
    });
    expect(obs.localId).toBeDefined();
    expect(obs.projectLocalId).toBe(project.localId);
    expect(obs.tags).toEqual({ species: 'jaguar', location: 'forest' });
    expect(obs.sourceType).toBe('local');
    expect(obs.deleted).toBe(false);
  });

  it('createObservation — creates without tags (defaults to empty object)', async () => {
    const project = await createProject({});
    const obs = await createObservation({ projectLocalId: project.localId });
    expect(obs.tags).toEqual({});
  });

  it('getObservations — lists observations by project', async () => {
    const projA = await createProject({ name: 'A' });
    const projB = await createProject({ name: 'B' });
    await createObservation({ projectLocalId: projA.localId });
    await createObservation({ projectLocalId: projA.localId });
    await createObservation({ projectLocalId: projB.localId });

    const obsA = await getObservations(projA.localId);
    expect(obsA).toHaveLength(2);

    const obsB = await getObservations(projB.localId);
    expect(obsB).toHaveLength(1);
  });

  it('getObservation — returns observation by localId', async () => {
    const project = await createProject({});
    const created = await createObservation({
      projectLocalId: project.localId,
    });
    const found = await getObservation(created.localId);
    expect(found).toBeDefined();
    expect(found!.localId).toBe(created.localId);
  });

  it('getObservation — returns undefined for non-existent id', async () => {
    const found = await getObservation('non-existent');
    expect(found).toBeUndefined();
  });

  it('updateObservation — updates tags and updatedAt', async () => {
    const project = await createProject({});
    const created = await createObservation({
      projectLocalId: project.localId,
      tags: { old: 'value' },
    });
    const originalUpdatedAt = created.updatedAt;

    await new Promise((r) => setTimeout(r, 5));

    const updated = await updateObservation(created.localId, {
      tags: { new: 'value' },
    });
    expect(updated).toBeDefined();
    expect(updated!.tags).toEqual({ new: 'value' });
    expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('excludes soft-deleted observations from getObservations', async () => {
    const project = await createProject({ name: 'ObsProject' });
    const o1 = await createObservation({ projectLocalId: project.localId });
    const o2 = await createObservation({ projectLocalId: project.localId });
    await updateObservation(o2.localId, { deleted: true });
    const observations = await getObservations(project.localId);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.localId).toBe(o1.localId);
  });

  it('deleteObservation — removes the observation', async () => {
    const project = await createProject({});
    const created = await createObservation({
      projectLocalId: project.localId,
    });
    await deleteObservation(created.localId);
    const found = await getObservation(created.localId);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

describe('local-repositories functions — alerts', () => {
  it('createAlert — creates an alert scoped to a project', async () => {
    const project = await createProject({ name: 'AlertProject' });
    const alert = await createAlert({ projectLocalId: project.localId });
    expect(alert.localId).toBeDefined();
    expect(alert.projectLocalId).toBe(project.localId);
    expect(alert.sourceType).toBe('local');
    expect(alert.deleted).toBe(false);
  });

  it('getAlerts — lists alerts by project', async () => {
    const projA = await createProject({ name: 'A' });
    const projB = await createProject({ name: 'B' });
    await createAlert({ projectLocalId: projA.localId });
    await createAlert({ projectLocalId: projA.localId });
    await createAlert({ projectLocalId: projB.localId });

    const alertsA = await getAlerts(projA.localId);
    expect(alertsA).toHaveLength(2);

    const alertsB = await getAlerts(projB.localId);
    expect(alertsB).toHaveLength(1);
  });

  it('getAlert — returns alert by localId', async () => {
    const project = await createProject({});
    const created = await createAlert({ projectLocalId: project.localId });
    const found = await getAlert(created.localId);
    expect(found).toBeDefined();
    expect(found!.localId).toBe(created.localId);
  });

  it('getAlert — returns undefined for non-existent id', async () => {
    const found = await getAlert('non-existent');
    expect(found).toBeUndefined();
  });

  it('updateAlert — updates fields and changes updatedAt', async () => {
    const project = await createProject({});
    const created = await createAlert({ projectLocalId: project.localId });
    const originalUpdatedAt = created.updatedAt;

    await new Promise((r) => setTimeout(r, 5));

    const updated = await updateAlert(created.localId, { deleted: true });
    expect(updated).toBeDefined();
    expect(updated!.deleted).toBe(true);
    expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('excludes soft-deleted alerts from getAlerts', async () => {
    const project = await createProject({ name: 'AlertProject' });
    const a1 = await createAlert({ projectLocalId: project.localId });
    const a2 = await createAlert({ projectLocalId: project.localId });
    await updateAlert(a2.localId, { deleted: true });
    const alerts = await getAlerts(project.localId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.localId).toBe(a1.localId);
  });

  it('deleteAlert — removes the alert', async () => {
    const project = await createProject({});
    const created = await createAlert({ projectLocalId: project.localId });
    await deleteAlert(created.localId);
    const found = await getAlert(created.localId);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

describe('local-repositories functions — attachments', () => {
  it('createAttachment — creates an attachment linked to observation and project', async () => {
    const project = await createProject({ name: 'AttachProject' });
    const obs = await createObservation({ projectLocalId: project.localId });
    const attachment = await createAttachment({
      projectLocalId: project.localId,
      observationLocalId: obs.localId,
    });
    expect(attachment.localId).toBeDefined();
    expect(attachment.projectLocalId).toBe(project.localId);
    expect(attachment.observationLocalId).toBe(obs.localId);
    expect(attachment.sourceType).toBe('local');
    expect(attachment.deleted).toBe(false);
  });

  it('getAttachments — lists attachments by observation', async () => {
    const project = await createProject({});
    const obs1 = await createObservation({ projectLocalId: project.localId });
    const obs2 = await createObservation({ projectLocalId: project.localId });

    await createAttachment({
      projectLocalId: project.localId,
      observationLocalId: obs1.localId,
    });
    await createAttachment({
      projectLocalId: project.localId,
      observationLocalId: obs1.localId,
    });
    await createAttachment({
      projectLocalId: project.localId,
      observationLocalId: obs2.localId,
    });

    const attach1 = await getAttachments(obs1.localId);
    expect(attach1).toHaveLength(2);

    const attach2 = await getAttachments(obs2.localId);
    expect(attach2).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Remote Servers
// ---------------------------------------------------------------------------

describe('local-repositories functions — remote servers', () => {
  it('createRemoteServer — creates with label', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://example.com',
      label: 'My Server',
    });
    expect(server.id).toBeDefined();
    expect(server.baseUrl).toBe('https://example.com');
    expect(server.label).toBe('My Server');
    expect(server.status).toBe('idle');
    expect(server.lastSyncedAt).toBe('');
  });

  it('createRemoteServer — creates without label', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://no-label.com',
    });
    expect(server.label).toBeUndefined();
    expect(server.status).toBe('idle');
  });

  it('createRemoteServer — creates with custom status', async () => {
    const server = await createRemoteServer({
      baseUrl: 'https://custom.com',
      status: 'syncing',
    });
    expect(server.status).toBe('syncing');
  });

  it('getRemoteServers — returns all servers', async () => {
    await createRemoteServer({ baseUrl: 'https://a.com' });
    await createRemoteServer({ baseUrl: 'https://b.com' });
    const servers = await getRemoteServers();
    expect(servers).toHaveLength(2);
  });

  it('getRemoteServer — returns server by id', async () => {
    const created = await createRemoteServer({ baseUrl: 'https://find.com' });
    const found = await getRemoteServer(created.id);
    expect(found).toBeDefined();
    expect(found!.baseUrl).toBe('https://find.com');
  });

  it('getRemoteServer — returns undefined for non-existent id', async () => {
    const found = await getRemoteServer('non-existent');
    expect(found).toBeUndefined();
  });

  it('getRemoteServerByBaseUrl — finds server by URL', async () => {
    await createRemoteServer({ baseUrl: 'https://unique.com' });
    await createRemoteServer({ baseUrl: 'https://other.com' });
    const found = await getRemoteServerByBaseUrl('https://unique.com');
    expect(found).toBeDefined();
    expect(found!.baseUrl).toBe('https://unique.com');
  });

  it('getRemoteServerByBaseUrl — returns undefined when no match', async () => {
    const found = await getRemoteServerByBaseUrl('https://missing.com');
    expect(found).toBeUndefined();
  });

  it('updateRemoteServer — updates status and label', async () => {
    const created = await createRemoteServer({
      baseUrl: 'https://update.com',
      label: 'Before',
    });
    const updated = await updateRemoteServer(created.id, {
      status: 'synced',
      label: 'After',
    });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('synced');
    expect(updated!.label).toBe('After');
  });

  it('deleteRemoteServer — removes the server', async () => {
    const created = await createRemoteServer({ baseUrl: 'https://delete.com' });
    await deleteRemoteServer(created.id);
    const found = await getRemoteServer(created.id);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sync Metadata
// ---------------------------------------------------------------------------

describe('local-repositories functions — sync metadata', () => {
  it('upsertSyncMetadata — creates a new entry', async () => {
    const meta = {
      id: 'sync-1',
      serverId: 'server-1',
      status: 'idle',
      updatedAt: new Date().toISOString(),
    };
    const result = await upsertSyncMetadata(meta);
    expect(result).toEqual(meta);
  });

  it('upsertSyncMetadata — updates an existing entry (upsert)', async () => {
    const meta = {
      id: 'sync-1',
      serverId: 'server-1',
      status: 'idle',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    await upsertSyncMetadata(meta);

    const updated = await upsertSyncMetadata({
      ...meta,
      status: 'syncing',
      updatedAt: '2025-01-02T00:00:00Z',
    });

    expect(updated.status).toBe('syncing');

    // Should be only 1 entry (upserted, not duplicated)
    const all = await getSyncMetadata();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('syncing');
  });

  it('getSyncMetadata — returns all entries', async () => {
    await upsertSyncMetadata({
      id: 'sync-1',
      serverId: 'server-1',
      status: 'idle',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    await upsertSyncMetadata({
      id: 'sync-2',
      serverId: 'server-2',
      status: 'syncing',
      updatedAt: '2025-01-02T00:00:00Z',
    });

    const all = await getSyncMetadata();
    expect(all).toHaveLength(2);
  });
});
