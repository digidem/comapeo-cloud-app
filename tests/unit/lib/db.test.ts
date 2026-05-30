import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import type { Field, Preset, Track } from '@/lib/db';

beforeEach(async () => {
  await resetDb();
});

describe('AppDatabase', () => {
  it('exposes all 9 required tables', async () => {
    const db = getDb();

    expect(db.projects).toBeDefined();
    expect(db.observations).toBeDefined();
    expect(db.alerts).toBeDefined();
    expect(db.attachments).toBeDefined();
    expect(db.tracks).toBeDefined();
    expect(db.fields).toBeDefined();
    expect(db.remoteServers).toBeDefined();
    expect(db.syncMetadata).toBeDefined();
    expect(db.presets).toBeDefined();
  });

  it('defines &localId as the primary key for projects', async () => {
    const db = getDb();

    const table = db.projects;
    expect(table.name).toBe('projects');
    expect(table.schema.primKey.name).toBe('localId');
    expect(table.schema.primKey.keyPath).toBe('localId');
    expect(table.schema.primKey.unique).toBe(true); // '&' prefix = unique
  });

  it('defines &localId as the primary key for observations', async () => {
    const db = getDb();

    expect(db.observations.name).toBe('observations');
    expect(db.observations.schema.primKey.name).toBe('localId');
    expect(db.observations.schema.primKey.keyPath).toBe('localId');
    expect(db.observations.schema.primKey.unique).toBe(true);
  });

  it('defines &localId as the primary key for alerts', async () => {
    const db = getDb();

    expect(db.alerts.name).toBe('alerts');
    expect(db.alerts.schema.primKey.name).toBe('localId');
    expect(db.alerts.schema.primKey.keyPath).toBe('localId');
    expect(db.alerts.schema.primKey.unique).toBe(true);
  });

  it('defines &localId as the primary key for attachments', async () => {
    const db = getDb();

    expect(db.attachments.name).toBe('attachments');
    expect(db.attachments.schema.primKey.name).toBe('localId');
    expect(db.attachments.schema.primKey.keyPath).toBe('localId');
    expect(db.attachments.schema.primKey.unique).toBe(true);
  });

  it('defines &localId as the primary key for tracks', async () => {
    const db = getDb();

    expect(db.tracks.name).toBe('tracks');
    expect(db.tracks.schema.primKey.name).toBe('localId');
    expect(db.tracks.schema.primKey.keyPath).toBe('localId');
    expect(db.tracks.schema.primKey.unique).toBe(true);
  });

  it('defines &localId as the primary key for fields', async () => {
    const db = getDb();

    expect(db.fields.name).toBe('fields');
    expect(db.fields.schema.primKey.name).toBe('localId');
    expect(db.fields.schema.primKey.keyPath).toBe('localId');
    expect(db.fields.schema.primKey.unique).toBe(true);
  });

  it('defines &id as the primary key for remoteServers', async () => {
    const db = getDb();

    expect(db.remoteServers.name).toBe('remoteServers');
    expect(db.remoteServers.schema.primKey.name).toBe('id');
    expect(db.remoteServers.schema.primKey.keyPath).toBe('id');
    expect(db.remoteServers.schema.primKey.unique).toBe(true);
  });

  it('defines &id as the primary key for syncMetadata', async () => {
    const db = getDb();

    expect(db.syncMetadata.name).toBe('syncMetadata');
    expect(db.syncMetadata.schema.primKey.name).toBe('id');
    expect(db.syncMetadata.schema.primKey.keyPath).toBe('id');
    expect(db.syncMetadata.schema.primKey.unique).toBe(true);
  });

  it('stores and retrieves a project record', async () => {
    const db = getDb();

    const project: Parameters<typeof db.projects.add>[0] = {
      localId: 'proj-1',
      sourceType: 'comapeo',
      sourceId: 'device-1',
      remoteId: 'remote-proj-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.projects.add(project);
    const retrieved = await db.projects.get('proj-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.localId).toBe('proj-1');
    expect(retrieved!.sourceType).toBe('comapeo');
    expect(retrieved!.dirtyLocal).toBe(true);
  });

  it('stores and retrieves an observation record', async () => {
    const db = getDb();

    const observation: Parameters<typeof db.observations.add>[0] = {
      localId: 'obs-1',
      projectLocalId: 'proj-1',
      sourceType: 'comapeo',
      sourceId: 'device-1',
      remoteId: 'remote-obs-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.observations.add(observation);
    const retrieved = await db.observations.get('obs-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.localId).toBe('obs-1');
    expect(retrieved!.projectLocalId).toBe('proj-1');
  });

  it('stores observation with lat/lon fields', async () => {
    const db = getDb();

    const observation: Parameters<typeof db.observations.add>[0] = {
      localId: 'obs-latlon',
      projectLocalId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
      lat: -3.123,
      lon: -60.456,
    };

    await db.observations.add(observation);
    const retrieved = await db.observations.get('obs-latlon');
    expect(retrieved).toBeDefined();
    expect(retrieved!.lat).toBe(-3.123);
    expect(retrieved!.lon).toBe(-60.456);
  });

  it('stores observation metadata and direct preset reference', async () => {
    const db = getDb();

    const observation: Parameters<typeof db.observations.add>[0] = {
      localId: 'obs-metadata',
      projectLocalId: 'proj-1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-obs-1',
      versionId: 'remote-obs-1/0',
      originalVersionId: 'remote-obs-1/0',
      schemaName: 'observation',
      links: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
      metadata: { manualLocation: true },
      presetRefDocId: 'preset-forest',
      presetRef: {
        docId: 'preset-forest',
        versionId: 'preset-forest/0',
        url: '/projects/proj-1/preset/preset-forest',
      },
    };

    await db.observations.add(observation);
    const retrieved = await db.observations.get('obs-metadata');
    expect(retrieved).toBeDefined();
    expect(retrieved!.metadata).toEqual({ manualLocation: true });
    expect(retrieved!.presetRefDocId).toBe('preset-forest');
    expect(retrieved!.versionId).toBe('remote-obs-1/0');
    expect(retrieved!.presetRef?.url).toBe(
      '/projects/proj-1/preset/preset-forest',
    );
  });

  it('stores observation without lat/lon (backward compatibility)', async () => {
    const db = getDb();

    const observation: Parameters<typeof db.observations.add>[0] = {
      localId: 'obs-nolatlon',
      projectLocalId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.observations.add(observation);
    const retrieved = await db.observations.get('obs-nolatlon');
    expect(retrieved).toBeDefined();
    expect(retrieved!.lat).toBeUndefined();
    expect(retrieved!.lon).toBeUndefined();
  });

  it('stores and retrieves an alert record', async () => {
    const db = getDb();

    const alert: Parameters<typeof db.alerts.add>[0] = {
      localId: 'alert-1',
      projectLocalId: 'proj-1',
      sourceType: 'satellite',
      sourceId: 'sensor-1',
      remoteId: 'remote-alert-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };

    await db.alerts.add(alert);
    const retrieved = await db.alerts.get('alert-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.localId).toBe('alert-1');
    expect(retrieved!.sourceType).toBe('satellite');
  });

  it('stores and retrieves an attachment record', async () => {
    const db = getDb();

    const attachment: Parameters<typeof db.attachments.add>[0] = {
      localId: 'att-1',
      projectLocalId: 'proj-1',
      observationLocalId: 'obs-1',
      sourceType: 'drive',
      sourceId: 'drive-abc',
      remoteId: 'remote-att-1',
      sourceDocId: 'obs-1:0',
      driveId: 'drive-abc',
      type: 'photo',
      name: 'image.jpg',
      hash: 'hash-1',
      remoteUrl: '/projects/proj-1/attachments/drive-abc/photo/image.jpg',
      resolvedUrl:
        'https://archive.example.com/projects/proj-1/attachments/drive-abc/photo/image.jpg',
      mediaType: 'photo',
      contentType: 'image/jpeg',
      downloadStatus: 'remote-only',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.attachments.add(attachment);
    const retrieved = await db.attachments.get('att-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.localId).toBe('att-1');
    expect(retrieved!.observationLocalId).toBe('obs-1');
    expect(retrieved!.driveId).toBe('drive-abc');
    expect(retrieved!.name).toBe('image.jpg');
    expect(retrieved!.mediaType).toBe('photo');
    expect(retrieved!.downloadStatus).toBe('remote-only');
  });

  it('stores and retrieves a track record', async () => {
    const db = getDb();

    const track: Track = {
      localId: 'track-1',
      projectLocalId: 'proj-1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-track-1',
      versionId: 'remote-track-1/0',
      originalVersionId: 'remote-track-1/0',
      schemaName: 'track',
      links: [],
      tags: { patrol: 'north' },
      presetRefDocId: 'preset-track',
      presetRef: {
        docId: 'preset-track',
        versionId: 'preset-track/0',
        url: '/projects/proj-1/preset/preset-track',
      },
      locations: [
        {
          coords: { latitude: -8.1, longitude: -55.2 },
          timestamp: '2026-01-01T00:00:00Z',
          accuracy: 5,
          altitude: 20,
        },
      ],
      observationRefs: [
        {
          docId: 'obs-1',
          versionId: 'obs-1/0',
          url: '/projects/proj-1/observation/obs-1',
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };

    await db.tracks.add(track);
    const retrieved = await db.tracks.get('track-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.locations).toEqual(track.locations);
    expect(retrieved!.observationRefs[0]!.docId).toBe('obs-1');
    expect(retrieved!.presetRef?.versionId).toBe('preset-track/0');
  });

  it('stores and retrieves a field record', async () => {
    const db = getDb();

    const field: Field = {
      localId: 'field-1',
      projectLocalId: 'proj-1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-field-1',
      versionId: 'remote-field-1/0',
      originalVersionId: 'remote-field-1/0',
      schemaName: 'field',
      links: [],
      type: 'select_one',
      key: 'condition',
      label: 'Condition',
      placeholder: 'Choose one',
      universal: false,
      options: [
        { label: 'Good', value: 'good' },
        { label: 'Bad', value: 'bad' },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };

    await db.fields.add(field);
    const retrieved = await db.fields.get('field-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.versionId).toBe('remote-field-1/0');
    expect(retrieved!.key).toBe('condition');
    expect(retrieved!.options).toEqual(field.options);
  });

  it('stores and retrieves a remoteServer record', async () => {
    const db = getDb();

    const server: Parameters<typeof db.remoteServers.add>[0] = {
      id: 'server-1',
      baseUrl: 'https://example.com',
      status: 'connected',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    };

    await db.remoteServers.add(server);
    const retrieved = await db.remoteServers.get('server-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('server-1');
    expect(retrieved!.baseUrl).toBe('https://example.com');
  });

  it('stores and retrieves a syncMetadata record', async () => {
    const db = getDb();

    const meta: Parameters<typeof db.syncMetadata.add>[0] = {
      id: 'sync-1',
      serverId: 'server-1',
      status: 'complete',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    await db.syncMetadata.add(meta);
    const retrieved = await db.syncMetadata.get('sync-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('sync-1');
    expect(retrieved!.serverId).toBe('server-1');
  });

  it('resetDb clears all tables', async () => {
    const db = getDb();

    // Insert a record
    await db.projects.add({
      localId: 'proj-to-clear',
      sourceType: 'comapeo',
      sourceId: 'dev-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    await resetDb();

    const retrieved = await db.projects.get('proj-to-clear');
    expect(retrieved).toBeUndefined();
  });

  it('version 2 migration backfills lat/lon as undefined on observations that lack them', async () => {
    const db = getDb();

    // Simulate a v1 observation record without lat/lon keys by inserting
    // raw data and then running the migration modify logic manually.
    await db.observations.add({
      localId: 'obs-migration-test',
      projectLocalId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Verify it was inserted without lat/lon
    const before = await db.observations.get('obs-migration-test');
    expect(before).toBeDefined();
    expect(before!.lat).toBeUndefined();
    expect(before!.lon).toBeUndefined();

    // Run the same backfill logic the migration uses
    await db.observations.toCollection().modify((obs) => {
      // Use `any` to bypass strict Observation typing for migration simulation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = obs as any;
      if (!('lat' in rec)) rec.lat = undefined;
      if (!('lon' in rec)) rec.lon = undefined;
    });

    // Verify the record now has explicit lat/lon keys
    const after = await db.observations.get('obs-migration-test');
    expect(after).toBeDefined();
    expect(after!.lat).toBeUndefined();
    expect(after!.lon).toBeUndefined();
    // Verify keys exist even though values are undefined
    expect('lat' in after!).toBe(true);
    expect('lon' in after!).toBe(true);
  });

  it('v9 track migration: converts string presetRef and string[] observationRefs to RemoteDocRef objects', async () => {
    const db = getDb();

    // Simulate the pre-v9 shape: presetRef is a string docId, observationRefs
    // is string[]. (This was the previous PR #67 storage shape.)
    await db.tracks.add({
      localId: 'remoteArchive:server1:track-old-1',
      projectLocalId: 'proj-1',
      sourceType: 'remoteArchive',
      sourceId: 'server1',
      remoteId: 'track-old-1',
      presetRef: 'preset-old-1' as unknown as Track['presetRef'],
      locations: [],
      observationRefs: [
        'obs-old-1',
        'obs-old-2',
      ] as unknown as Track['observationRefs'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Run the same upgrade logic the migration uses
    type Track = import('@/lib/db').Track;
    const upgrade = (track: Track) => {
      const t = track as unknown as Record<string, unknown>;
      if (typeof t.presetRef === 'string') {
        t.presetRef = { docId: t.presetRef };
      }
      if (Array.isArray(t.observationRefs)) {
        t.observationRefs = t.observationRefs.map((ref) =>
          typeof ref === 'string' ? { docId: ref } : ref,
        );
      }
    };
    await db.tracks.toCollection().modify(upgrade as never);

    const migrated = await db.tracks.get('remoteArchive:server1:track-old-1');
    expect(migrated).toBeDefined();
    expect(migrated!.presetRef).toEqual({ docId: 'preset-old-1' });
    expect(migrated!.observationRefs).toEqual([
      { docId: 'obs-old-1' },
      { docId: 'obs-old-2' },
    ]);
  });

  it('stores and retrieves a project with description', async () => {
    const db = getDb();

    const project: Parameters<typeof db.projects.add>[0] = {
      localId: 'proj-desc',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Forest Monitoring',
      description: 'Monitoring deforestation in the Amazon',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.projects.add(project);
    const retrieved = await db.projects.get('proj-desc');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Forest Monitoring');
    expect(retrieved!.description).toBe(
      'Monitoring deforestation in the Amazon',
    );
  });

  it('stores project without description as undefined', async () => {
    const db = getDb();

    const project: Parameters<typeof db.projects.add>[0] = {
      localId: 'proj-nodesc',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: true,
      deleted: false,
    };

    await db.projects.add(project);
    const retrieved = await db.projects.get('proj-nodesc');
    expect(retrieved).toBeDefined();
    expect(retrieved!.description).toBeUndefined();
  });

  it('version 4 migration backfills description as undefined on projects that lack it', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-migration-test',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Run the same backfill logic the migration uses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.projects.toCollection().modify((proj: any) => {
      if (!('description' in proj)) proj.description = undefined;
    });

    const after = await db.projects.get('proj-migration-test');
    expect(after).toBeDefined();
    expect(after!.description).toBeUndefined();
    expect('description' in after!).toBe(true);
  });

  it('defines &localId as the primary key for presets', async () => {
    const db = getDb();

    expect(db.presets.name).toBe('presets');
    expect(db.presets.schema.primKey.name).toBe('localId');
    expect(db.presets.schema.primKey.keyPath).toBe('localId');
    expect(db.presets.schema.primKey.unique).toBe(true);
  });
});

describe('presets table', () => {
  it('can store and retrieve a preset', async () => {
    const db = getDb();
    const preset: Preset = {
      localId: 'remoteArchive:https://example.com:preset-001',
      projectLocalId: 'project-local-1',
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'preset-001',
      name: 'Deforestation',
      color: '#FF5733',
      iconDocId: 'icon-001',
      terms: ['logging'],
      fieldRefs: ['field-001'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    };
    await db.presets.put(preset);
    const stored = await db.presets.get(preset.localId);
    expect(stored).toBeDefined();
    expect(stored!.name).toBe('Deforestation');
    expect(stored!.color).toBe('#FF5733');
  });

  it('queries presets by projectLocalId', async () => {
    const db = getDb();
    await db.presets.bulkPut([
      {
        localId: 'p1',
        projectLocalId: 'proj-a',
        sourceType: 'remoteArchive',
        sourceId: 's1',
        name: 'A',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
        fieldRefs: [],
        terms: [],
      },
      {
        localId: 'p2',
        projectLocalId: 'proj-b',
        sourceType: 'remoteArchive',
        sourceId: 's1',
        name: 'B',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
        fieldRefs: [],
        terms: [],
      },
      {
        localId: 'p3',
        projectLocalId: 'proj-a',
        sourceType: 'remoteArchive',
        sourceId: 's1',
        name: 'C',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
        fieldRefs: [],
        terms: [],
      },
    ]);
    const presets = await db.presets
      .where('projectLocalId')
      .equals('proj-a')
      .toArray();
    expect(presets).toHaveLength(2);
  });
});
