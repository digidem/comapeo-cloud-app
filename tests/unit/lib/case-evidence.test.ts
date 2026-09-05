import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  addCaseEvidence,
  getCaseEvidence,
  getCaseEvidenceAttachments,
  getCaseEvidenceCounts,
  removeCaseEvidence,
  setCaseEvidenceAttachmentSelected,
} from '@/lib/local-repositories';

beforeEach(async () => {
  await resetDb();
});

async function seedProject(localId: string) {
  await getDb().projects.add({
    localId,
    sourceType: 'remoteArchive',
    sourceId: 'https://archive.example',
    remoteId: `remote-${localId}`,
    name: localId,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    dirtyLocal: false,
    deleted: false,
  });
}

async function seedCase(projectLocalId: string, localId = 'case-1') {
  await getDb().cases.add({
    localId,
    projectLocalId,
    title: 'Evidence case',
    caseType: 'illegal_mining',
    status: 'draft',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    revision: 1,
    createdBy: 'local',
    deleted: false,
  });
  return localId;
}

describe('Case evidence references', () => {
  it('stores provenance only and detects changed, deleted, unavailable, and unsynced source state', async () => {
    await seedProject('project-1');
    const caseLocalId = await seedCase('project-1');
    const db = getDb();
    await db.observations.add({
      localId: 'observation-1',
      projectLocalId: 'project-1',
      sourceType: 'remoteArchive',
      sourceId: 'https://archive.example',
      remoteId: 'obs-remote-1',
      versionId: 'v1',
      tags: { note: 'must not be copied into the Case evidence table' },
      lat: -3.12,
      lon: -60.02,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });

    const reference = await addCaseEvidence({
      projectLocalId: 'project-1',
      caseLocalId,
      sourceType: 'observation',
      sourceLocalId: 'observation-1',
    });

    expect(reference.sourceRemoteId).toBe('obs-remote-1');
    expect(reference.sourceVersionId).toBe('v1');
    expect(reference).not.toHaveProperty('tags');
    expect(reference).not.toHaveProperty('lat');
    expect(reference).not.toHaveProperty('lon');

    let [resolved] = await getCaseEvidence('project-1', caseLocalId);
    expect(resolved?.availability).toBe('available');
    expect(resolved?.freshness).toBe('current');
    expect(resolved?.syncState).toBe('synced');

    await db.observations.update('observation-1', {
      versionId: 'v2',
      updatedAt: '2026-09-02T10:00:00.000Z',
      dirtyLocal: true,
    });
    [resolved] = await getCaseEvidence('project-1', caseLocalId);
    expect(resolved?.freshness).toBe('changed');
    expect(resolved?.syncState).toBe('unsynced');

    await db.observations.update('observation-1', { deleted: true });
    [resolved] = await getCaseEvidence('project-1', caseLocalId);
    expect(resolved?.availability).toBe('deleted');
    expect(resolved?.source).toMatchObject({
      localId: 'observation-1',
      tags: { note: 'must not be copied into the Case evidence table' },
      deleted: true,
    });

    await db.observations.delete('observation-1');
    [resolved] = await getCaseEvidence('project-1', caseLocalId);
    expect(resolved?.availability).toBe('unavailable');
    expect(resolved?.syncState).toBe('unknown');
    expect(resolved?.source).toBeUndefined();
  });

  it('rejects cross-project evidence and deduplicates the same source in one Case', async () => {
    await seedProject('project-1');
    await seedProject('project-2');
    const caseLocalId = await seedCase('project-1');
    await getDb().alerts.add({
      localId: 'alert-2',
      projectLocalId: 'project-2',
      sourceType: 'remoteArchive',
      sourceId: 'https://archive.example',
      remoteId: 'alert-remote-2',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });

    await expect(
      addCaseEvidence({
        projectLocalId: 'project-1',
        caseLocalId,
        sourceType: 'alert',
        sourceLocalId: 'alert-2',
      }),
    ).rejects.toThrow();

    await getDb().alerts.add({
      localId: 'alert-1',
      projectLocalId: 'project-1',
      sourceType: 'remoteArchive',
      sourceId: 'https://archive.example',
      remoteId: 'alert-remote-1',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });
    const first = await addCaseEvidence({
      projectLocalId: 'project-1',
      caseLocalId,
      sourceType: 'alert',
      sourceLocalId: 'alert-1',
    });
    const second = await addCaseEvidence({
      projectLocalId: 'project-1',
      caseLocalId,
      sourceType: 'alert',
      sourceLocalId: 'alert-1',
    });
    expect(second.localId).toBe(first.localId);
    expect(await getCaseEvidence('project-1', caseLocalId)).toHaveLength(1);
  });

  it('counts evidence per Case without resolving source records', async () => {
    await seedProject('project-1');
    await seedCase('project-1', 'case-1');
    await seedCase('project-1', 'case-2');
    const db = getDb();
    await db.caseEvidence.bulkAdd([
      {
        localId: 'evidence-1',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        sourceType: 'observation',
        sourceLocalId: 'missing-observation-1',
        sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
        addedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        localId: 'evidence-2',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        sourceType: 'alert',
        sourceLocalId: 'missing-alert-1',
        sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
        addedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        localId: 'evidence-3',
        caseLocalId: 'case-2',
        projectLocalId: 'project-1',
        sourceType: 'track',
        sourceLocalId: 'missing-track-1',
        sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
        addedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    await expect(getCaseEvidenceCounts('project-1')).resolves.toEqual({
      'case-1': 2,
      'case-2': 1,
    });
  });

  it('selects photo/audio attachments separately from their parent observation and cascades removal', async () => {
    await seedProject('project-1');
    const caseLocalId = await seedCase('project-1');
    const db = getDb();
    await db.observations.add({
      localId: 'observation-1',
      projectLocalId: 'project-1',
      sourceType: 'remoteArchive',
      sourceId: 'https://archive.example',
      remoteId: 'obs-remote-1',
      versionId: 'v1',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });
    await db.attachments.bulkAdd([
      {
        localId: 'photo-1',
        projectLocalId: 'project-1',
        observationLocalId: 'observation-1',
        sourceType: 'remoteArchive',
        sourceId: 'https://archive.example',
        remoteId: 'media-1',
        hash: 'original-photo-hash',
        mediaType: 'photo',
        contentType: 'image/jpeg',
        downloadStatus: 'available',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'audio-1',
        projectLocalId: 'project-1',
        observationLocalId: 'observation-1',
        sourceType: 'remoteArchive',
        sourceId: 'https://archive.example',
        remoteId: 'media-2',
        hash: 'original-audio-hash',
        mediaType: 'audio',
        contentType: 'audio/mpeg',
        downloadStatus: 'remote-only',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    const evidence = await addCaseEvidence({
      projectLocalId: 'project-1',
      caseLocalId,
      sourceType: 'observation',
      sourceLocalId: 'observation-1',
    });
    expect(await getCaseEvidenceAttachments('project-1', caseLocalId)).toEqual(
      [],
    );

    await setCaseEvidenceAttachmentSelected({
      projectLocalId: 'project-1',
      caseLocalId,
      evidenceLocalId: evidence.localId,
      attachmentLocalId: 'photo-1',
      selected: true,
    });
    const selected = await getCaseEvidenceAttachments('project-1', caseLocalId);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      attachmentLocalId: 'photo-1',
      originalHash: 'original-photo-hash',
      mediaType: 'photo',
      availability: 'available',
    });

    await removeCaseEvidence({
      projectLocalId: 'project-1',
      caseLocalId,
      evidenceLocalId: evidence.localId,
    });
    expect(await getCaseEvidenceAttachments('project-1', caseLocalId)).toEqual(
      [],
    );
  });
});
