import { beforeEach, describe, expect, it } from 'vitest';

import {
  getCaseActivity,
  getCaseReportState,
  getCaseReportStates,
  recordCaseActivity,
  upsertCaseReportState,
} from '@/lib/data-layer';
import { getDb, resetDb } from '@/lib/db';
import type { Case } from '@/lib/db';
import { DbError } from '@/lib/db-error';
import {
  createCase,
  deleteCase,
  getCase,
  getCases,
  updateCase,
} from '@/lib/local-repositories';
import { uuid } from '@/lib/uuid';

beforeEach(async () => {
  await resetDb();
});

function makeProjectId(): string {
  return uuid();
}

function makeCaseId(): string {
  return uuid();
}

/** Create a real owning project row and return its localId. */
async function makeProject(
  opts: {
    sourceType?: string;
    sourceId?: string;
    remoteId?: string;
  } = {},
): Promise<string> {
  const db = getDb();
  const localId = makeProjectId();
  await db.projects.add({
    localId,
    sourceType: opts.sourceType ?? 'local',
    sourceId: opts.sourceId ?? 'local',
    remoteId: opts.remoteId,
    name: 'Test Project',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    dirtyLocal: true,
    deleted: false,
  });
  return localId;
}

// ---------------------------------------------------------------------------
// Case type & schema tests
// ---------------------------------------------------------------------------

describe('Case type exports', () => {
  it('exports Case, CaseActivity, CaseReportState types', async () => {
    // Smoke-test that the types module re-exports the shapes used below.
    const sampleCase: Case = {
      localId: makeCaseId(),
      projectLocalId: makeProjectId(),
      title: 'My Case',
      caseType: 'illegal_mining',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      revision: 1,
      createdBy: 'local',
      deleted: false,
      remoteProjectNamespace: 'comapeo',
      remoteProjectId: 'remote-proj-1',
    };
    expect(sampleCase.localId).toBeDefined();
    expect(sampleCase.caseType).toBe('illegal_mining');
    expect(sampleCase.status).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// Case CRUD & project scoping
// ---------------------------------------------------------------------------

describe('Case CRUD', () => {
  it('createCase — requires title, caseType, projectLocalId, status, timestamps', async () => {
    const projectLocalId = await makeProject();
    // Missing required project must fail safely
    await expect(
      createCase({
        projectLocalId: 'missing-project',
        title: 'T',
        caseType: 'illegal_mining',
      }),
    ).rejects.toThrow(DbError);

    // Minimal valid creation
    const created = await createCase({
      projectLocalId,
      title: 'First Case',
      caseType: 'illegal_mining',
    });
    expect(created.localId).toBeDefined();
    expect(created.projectLocalId).toBe(projectLocalId);
    expect(created.title).toBe('First Case');
    expect(created.caseType).toBe('illegal_mining');
    expect(created.status).toBe('draft');
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();
    expect(created.revision).toBe(1);
    expect(created.createdBy).toBe('local');
  });

  it('createCase — copies remote project namespace/id from owning project when available', async () => {
    const projectLocalId = await makeProject({
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-proj-1',
    });

    const created = await createCase({
      projectLocalId,
      title: 'With remote project',
      caseType: 'illegal_mining',
    });
    expect(created.remoteProjectNamespace).toBe('remoteArchive');
    expect(created.remoteProjectId).toBe('remote-proj-1');
  });

  it('createCase — no remote fields when project is local', async () => {
    const projectLocalId = await makeProject();
    const created = await createCase({
      projectLocalId,
      title: 'Local project case',
      caseType: 'illegal_mining',
    });
    expect(created.remoteProjectNamespace).toBeUndefined();
    expect(created.remoteProjectId).toBeUndefined();
  });

  it('getCase — returns a case by localId', async () => {
    const projectLocalId = await makeProject();
    const created = await createCase({
      projectLocalId,
      title: 'Lookup',
      caseType: 'illegal_mining',
    });
    const found = await getCase(projectLocalId, created.localId);
    expect(found).toBeDefined();
    expect(found!.localId).toBe(created.localId);
    expect(found!.title).toBe('Lookup');
  });

  it('getCase — undefined for non-existent', async () => {
    const projectLocalId = await makeProject();
    const found = await getCase(projectLocalId, 'nope');
    expect(found).toBeUndefined();
  });

  it('getCase — rejects cross-project access: case from project A cannot be read under project B', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const created = await createCase({
      projectLocalId: projA,
      title: 'A case',
      caseType: 'illegal_mining',
    });
    const found = await getCase(projB, created.localId);
    expect(found).toBeUndefined();
  });

  it('getCases — lists cases scoped by project', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    await createCase({
      projectLocalId: projA,
      title: 'A1',
      caseType: 'illegal_mining',
    });
    await createCase({
      projectLocalId: projA,
      title: 'A2',
      caseType: 'illegal_mining',
    });
    await createCase({
      projectLocalId: projB,
      title: 'B1',
      caseType: 'illegal_mining',
    });

    const casesA = await getCases(projA);
    expect(casesA).toHaveLength(2);
    const titlesA = casesA.map((c) => c.title).sort();
    expect(titlesA).toEqual(['A1', 'A2']);

    const casesB = await getCases(projB);
    expect(casesB).toHaveLength(1);
    expect(casesB[0]!.title).toBe('B1');
  });

  it('updateCase — requires project scope and rejects cross-project update', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const created = await createCase({
      projectLocalId: projA,
      title: 'Original',
      caseType: 'illegal_mining',
    });

    // Updating under wrong project scope fails: returns undefined
    const wrong = await updateCase(projB, created.localId, { title: 'Hacked' });
    expect(wrong).toBeUndefined();

    // Updating under correct scope works
    const originalUpdatedAt = created.updatedAt;
    // small delay so timestamp differs
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateCase(projA, created.localId, {
      title: 'Revised',
    });
    expect(updated).toBeDefined();
    expect(updated!.title).toBe('Revised');
    expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
    expect(updated!.revision).toBe(2);

    // Re-fetch to confirm persisted
    const refetched = await getCase(projA, created.localId);
    expect(refetched!.title).toBe('Revised');
    expect(refetched!.revision).toBe(2);
  });

  it('deleteCase — removes the case and requires project scope', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const created = await createCase({
      projectLocalId: projA,
      title: 'To delete',
      caseType: 'illegal_mining',
    });

    // Cross-project delete is a no-op (returns false)
    const removed = await deleteCase(projB, created.localId);
    expect(removed).toBe(false);
    expect(await getCase(projA, created.localId)).toBeDefined();

    // Correct scope delete
    const result = await deleteCase(projA, created.localId);
    expect(result).toBe(true);
    expect(await getCase(projA, created.localId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Local-only delete cascade
// ---------------------------------------------------------------------------

describe('Case delete cascade (local-only)', () => {
  it('deleting a Case removes activity and report-state rows, not other projects data', async () => {
    const projA = await makeProject();
    const projB = await makeProject();

    const c1 = await createCase({
      projectLocalId: projA,
      title: 'C1',
      caseType: 'illegal_mining',
    });
    const c2 = await createCase({
      projectLocalId: projB,
      title: 'C2',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      event: 'created',
      status: 'draft',
    });
    await upsertCaseReportState({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    await recordCaseActivity({
      caseLocalId: c2.localId,
      projectLocalId: projB,
      event: 'created',
      status: 'draft',
    });

    // Delete only c1
    const removed = await deleteCase(projA, c1.localId);
    expect(removed).toBe(true);

    // c1's case row is gone
    expect(await getCase(projA, c1.localId)).toBeUndefined();

    const db = getDb();
    // c1's activity and report state are gone
    const c1Activity = await db.caseActivity
      .where('caseLocalId')
      .equals(c1.localId)
      .toArray();
    expect(c1Activity).toHaveLength(0);
    const c1State = await db.caseReportState
      .where('caseLocalId')
      .equals(c1.localId)
      .toArray();
    expect(c1State).toHaveLength(0);

    // c2 is untouched — createCase auto-records 1 'created' activity, plus the
    // manual recordCaseActivity above = 2 total for c2.
    expect(await getCase(projB, c2.localId)).toBeDefined();
    const c2Activity = await db.caseActivity
      .where('caseLocalId')
      .equals(c2.localId)
      .toArray();
    expect(c2Activity).toHaveLength(2);
  });

  it('deleting a project cascades case-owned rows for that project only', async () => {
    const projA = await makeProject();
    const projB = await makeProject();

    const c1 = await createCase({
      projectLocalId: projA,
      title: 'C1',
      caseType: 'illegal_mining',
    });
    const c2 = await createCase({
      projectLocalId: projB,
      title: 'C2',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      event: 'created',
      status: 'draft',
    });
    await upsertCaseReportState({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      agency: 'FUNAI',
      status: 'incomplete',
    });
    await recordCaseActivity({
      caseLocalId: c2.localId,
      projectLocalId: projB,
      event: 'created',
      status: 'draft',
    });
    await upsertCaseReportState({
      caseLocalId: c2.localId,
      projectLocalId: projB,
      agency: 'IBAMA',
      status: 'incomplete',
    });

    // Delete project A via repository deleteProject
    const { deleteProject } = await import('@/lib/local-repositories');
    await deleteProject(projA);

    const db = getDb();
    const aCases = await db.cases
      .where('projectLocalId')
      .equals(projA)
      .toArray();
    expect(aCases).toHaveLength(0);
    const aActivity = await db.caseActivity
      .where('projectLocalId')
      .equals(projA)
      .toArray();
    expect(aActivity).toHaveLength(0);
    const aState = await db.caseReportState
      .where('projectLocalId')
      .equals(projA)
      .toArray();
    expect(aState).toHaveLength(0);

    // B untouched
    const bCases = await db.cases
      .where('projectLocalId')
      .equals(projB)
      .toArray();
    expect(bCases).toHaveLength(1);
    const bActivity = await db.caseActivity
      .where('projectLocalId')
      .equals(projB)
      .toArray();
    expect(bActivity).toHaveLength(2);
  });

  it('Delete Project does not create remote/sync table rows for cases', async () => {
    const projA = await makeProject();
    const c1 = await createCase({
      projectLocalId: projA,
      title: 'C1',
      caseType: 'illegal_mining',
    });
    await recordCaseActivity({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      event: 'created',
      status: 'draft',
    });
    await upsertCaseReportState({
      caseLocalId: c1.localId,
      projectLocalId: projA,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    const beforeSync = await getDb().syncMetadata.count();
    const { deleteProject } = await import('@/lib/local-repositories');
    await deleteProject(projA);
    const afterSync = await getDb().syncMetadata.count();

    expect(afterSync).toBe(beforeSync);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

describe('Case lifecycle transitions', () => {
  it('Draft -> Active -> Closed retains data and records activity', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Lifecycle',
      caseType: 'illegal_mining',
    });
    expect(c.status).toBe('draft');

    const active = await updateCase(projectLocalId, c.localId, {
      status: 'active',
    });
    expect(active!.status).toBe('active');

    const closed = await updateCase(projectLocalId, c.localId, {
      status: 'closed',
    });
    expect(closed!.status).toBe('closed');

    // Data retained
    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe('closed');
    expect(fetched!.title).toBe('Lifecycle');
    expect(fetched!.caseType).toBe('illegal_mining');
    expect(fetched!.revision).toBe(3);

    // Activity recorded for transitions
    const activity = await getCaseActivity(projectLocalId, c.localId);
    const statuses = activity.map((a) => a.status).filter(Boolean);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('active');
    expect(statuses).toContain('closed');
  });

  it('Closed -> Active (reopen) without deleting records', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Reopen',
      caseType: 'illegal_mining',
    });
    await updateCase(projectLocalId, c.localId, { status: 'active' });
    await updateCase(projectLocalId, c.localId, { status: 'closed' });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'complete',
    });

    const reopened = await updateCase(projectLocalId, c.localId, {
      status: 'active',
    });
    expect(reopened!.status).toBe('active');

    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched!.status).toBe('active');
    const state = await getCaseReportState(projectLocalId, c.localId, 'FUNAI');
    expect(state).toBeDefined();
    expect(state!.status).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// Per-agency report state independence
// ---------------------------------------------------------------------------

describe('Per-agency report state independence', () => {
  it('creates and reads all four agencies', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Agencies',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'IBAMA',
      status: 'incomplete',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'MPF',
      status: 'incomplete',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'PF',
      status: 'incomplete',
    });

    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'FUNAI'))!.status,
    ).toBe('incomplete');
    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'IBAMA'))!.status,
    ).toBe('incomplete');
    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'MPF'))!.status,
    ).toBe('incomplete');
    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'PF'))!.status,
    ).toBe('incomplete');
  });

  it('updating one agency does not mutate another', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Independence',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'IBAMA',
      status: 'incomplete',
    });

    // Update FUNAI only
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'complete',
    });

    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'FUNAI'))!.status,
    ).toBe('complete');
    expect(
      (await getCaseReportState(projectLocalId, c.localId, 'IBAMA'))!.status,
    ).toBe('incomplete');
  });

  it('stored report state contains no disallowed fields', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Shape',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
      revision: 1,
    });

    const db = getDb();
    const raw = await db.caseReportState
      .where('[caseLocalId+agency]')
      .equals([c.localId, 'FUNAI'])
      .first();
    expect(raw).toBeDefined();

    const forbiddenKeys = [
      'reportBody',
      'reportText',
      'template',
      'templates',
      'aiPrompt',
      'prompts',
      'disclosure',
      'pdf',
      'pdfData',
      'providerToken',
      'credential',
      'secret',
    ];
    for (const key of forbiddenKeys) {
      expect(raw).not.toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Metadata-only activity
// ---------------------------------------------------------------------------

describe('Case activity (metadata-only)', () => {
  it('creates and lists activity scoped by case', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Activity',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId,
      event: 'created',
      status: 'draft',
    });
    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId,
      event: 'status_changed',
      status: 'active',
    });

    const activity = await getCaseActivity(projectLocalId, c.localId);
    // createCase records an initial 'created' event; plus the two below.
    expect(activity).toHaveLength(3);
    // The two 'created' events (one auto from createCase, one manual) share the
    // same createdAt timestamp, so sortBy('createdAt') order between them is
    // non-deterministic — assert the multiset rather than an exact ordering.
    const events = activity.map((a) => a.event).sort();
    expect(events).toEqual(['created', 'created', 'status_changed']);

    // projectLocalId is stored for cascade scoping
    expect(activity[0]!.projectLocalId).toBe(projectLocalId);
  });

  it('activity records are metadata-only: no case factual content, no actor names', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Sensitive Case Title With PII',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId,
      event: 'created',
      status: 'draft',
    });

    const db = getDb();
    const rows = await db.caseActivity.toArray();
    expect(rows).toHaveLength(2);

    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toContain('Sensitive Case Title With PII');
    expect(serialized).not.toContain('actorName');
    expect(serialized).not.toContain('actor');
    // no fabricated actor names
    expect(
      (rows[0] as unknown as Record<string, unknown>).actor,
    ).toBeUndefined();
  });

  it('does not store report body/text/prompt/transcript in activity', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'No leak',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId,
      event: 'report_state_changed',
      agency: 'FUNAI',
    });

    const db = getDb();
    const rows = await db.caseActivity.toArray();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('reportBody');
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('transcript');
  });
});

// ---------------------------------------------------------------------------
// Reset integration
// ---------------------------------------------------------------------------

describe('Reset integration for Cases', () => {
  it('resetDb clears cases, caseActivity, and caseReportState', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Will be reset',
      caseType: 'illegal_mining',
    });
    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId,
      event: 'created',
      status: 'draft',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    const db = getDb();
    expect(await db.cases.count()).toBe(1);
    expect(await db.caseActivity.count()).toBe(2);
    expect(await db.caseReportState.count()).toBe(1);

    await resetDb();

    expect(await db.cases.count()).toBe(0);
    expect(await db.caseActivity.count()).toBe(0);
    expect(await db.caseReportState.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gap 1: updateCase allowlist — identity, ownership, provenance, and system
// fields cannot be mutated through updateCase / data-layer.
// ---------------------------------------------------------------------------

describe('Case updateCase allowlist hardening (Gap 1)', () => {
  it('forbids mutating prohibited fields via runtime cast: revision', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Allowlist',
      caseType: 'illegal_mining',
    });

    // Attempt to clobber revision through the public updateCase surface.
    // Even if a caller bypasses TS (e.g. dynamic JSON), the implementation
    // must NOT persist forbidden fields.
    await updateCase(projectLocalId, c.localId, {
      title: 'Updated',
      revision: 999,
    } as never);

    const fetched = await getCase(projectLocalId, c.localId);
    // revision is managed by the data-layer: auto-incremented by 1 each update
    expect(fetched!.revision).toBe(2);
    expect(fetched!.title).toBe('Updated');
  });

  it('forbids mutating prohibited fields via runtime cast: deleted', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Not deleted',
      caseType: 'illegal_mining',
    });

    await updateCase(projectLocalId, c.localId, {
      title: 'Still visible',
      deleted: true,
    } as never);

    // deleted must remain false — the case must still be visible
    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched).toBeDefined();
    expect(fetched!.deleted).toBe(false);
    expect(fetched!.title).toBe('Still visible');
  });

  it('forbids mutating prohibited fields via runtime cast: createdBy', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Created',
      caseType: 'illegal_mining',
    });

    await updateCase(projectLocalId, c.localId, {
      title: 'Hijacked',
      createdBy: 'intruder',
    } as never);

    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched!.createdBy).toBe('local');
  });

  it('forbids mutating prohibited fields via runtime cast: remoteProjectId', async () => {
    const projectLocalId = await makeProject({
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'remote-proj-1',
    });
    const c = await createCase({
      projectLocalId,
      title: 'Provenance',
      caseType: 'illegal_mining',
    });

    await updateCase(projectLocalId, c.localId, {
      title: 'Stolen',
      remoteProjectId: 'remote-proj-2',
    } as never);

    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched!.remoteProjectId).toBe('remote-proj-1');
  });

  it('forbids mutating prohibited fields via runtime cast: remoteProjectNamespace', async () => {
    const projectLocalId = await makeProject({
      sourceType: 'remoteArchive',
      remoteId: 'remote-proj-1',
    });
    const c = await createCase({
      projectLocalId,
      title: 'Namespace',
      caseType: 'illegal_mining',
    });

    await updateCase(projectLocalId, c.localId, {
      title: 'Stolen',
      remoteProjectNamespace: 'comapeo',
    } as never);

    const fetched = await getCase(projectLocalId, c.localId);
    expect(fetched!.remoteProjectNamespace).toBe('remoteArchive');
  });

  it('allows updating only title, caseType, and status', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Original',
      caseType: 'illegal_mining',
    });

    const updated = await updateCase(projectLocalId, c.localId, {
      title: 'Revised',
      caseType: 'fire',
      status: 'active',
    });

    expect(updated).toBeDefined();
    expect(updated!.title).toBe('Revised');
    expect(updated!.caseType).toBe('fire');
    expect(updated!.status).toBe('active');
    expect(updated!.revision).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Gap 2: upsertCaseReportState must verify the Case exists and belongs to the
// supplied projectLocalId, rejecting mismatched or cross-project pairs.
// ---------------------------------------------------------------------------

describe('upsertCaseReportState ownership hardening (Gap 2)', () => {
  it('rejects a case that does not belong to the supplied projectLocalId', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'Owner',
      caseType: 'illegal_mining',
    });

    // Same caseLocalId but wrong projectLocalId — must throw
    await expect(
      upsertCaseReportState({
        caseLocalId: c.localId,
        projectLocalId: projB,
        agency: 'FUNAI',
        status: 'incomplete',
      }),
    ).rejects.toThrow(DbError);

    // The original case state is untouched
    const db = getDb();
    const states = await db.caseReportState
      .where('caseLocalId')
      .equals(c.localId)
      .toArray();
    expect(states).toHaveLength(0);
  });

  it('rejects a non-existent case entirely', async () => {
    const projectLocalId = await makeProject();

    await expect(
      upsertCaseReportState({
        caseLocalId: 'nonexistent-case',
        projectLocalId,
        agency: 'FUNAI',
        status: 'incomplete',
      }),
    ).rejects.toThrow(DbError);
  });

  it('still succeeds when projectLocalId matches the owning project', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'OK',
      caseType: 'illegal_mining',
    });

    const state = await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    expect(state).toBeDefined();
    expect(state.agency).toBe('FUNAI');
    expect(state.projectLocalId).toBe(projectLocalId);
  });
});

// ---------------------------------------------------------------------------
// Gap 3: getCaseActivity, getCaseReportState, getCaseReportStates must require
// projectLocalId and enforce Case ownership before returning rows.
// ---------------------------------------------------------------------------

describe('Case read APIs ownership hardening (Gap 3)', () => {
  it('getCaseActivity — cross-project returns undefined/empty', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'Activity Owner',
      caseType: 'illegal_mining',
    });

    await recordCaseActivity({
      caseLocalId: c.localId,
      projectLocalId: projA,
      event: 'created',
      status: 'draft',
    });

    // Cross-project: case belongs to projA, caller passes projB
    const result = await getCaseActivity(projB, c.localId);
    expect(result).toEqual([]);
  });

  it('recordCaseActivity — rejects mismatched project ownership and writes no row', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'Activity Write Owner',
      caseType: 'illegal_mining',
    });

    await expect(
      recordCaseActivity({
        caseLocalId: c.localId,
        projectLocalId: projB,
        event: 'status_changed',
        status: 'active',
      }),
    ).rejects.toThrow(DbError);

    const db = getDb();
    const rows = await db.caseActivity
      .where('caseLocalId')
      .equals(c.localId)
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.projectLocalId).toBe(projA);
  });

  it('getCaseActivity — ignores malformed rows from another project', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'Activity Read Owner',
      caseType: 'illegal_mining',
    });

    const db = getDb();
    await db.caseActivity.add({
      localId: 'malformed-cross-project-activity',
      caseLocalId: c.localId,
      projectLocalId: projB,
      event: 'status_changed',
      status: 'active',
      createdAt: '2026-01-02T00:00:00Z',
    });

    const activity = await getCaseActivity(projA, c.localId);
    expect(activity).toHaveLength(1);
    expect(activity.every((row) => row.projectLocalId === projA)).toBe(true);
  });

  it('getCaseActivity — correct project returns rows', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Activity',
      caseType: 'illegal_mining',
    });

    const activity = await getCaseActivity(projectLocalId, c.localId);
    // createCase auto-records a 'created' activity event
    expect(activity).toHaveLength(1);
    expect(activity[0]!.projectLocalId).toBe(projectLocalId);
  });

  it('getCaseReportState — cross-project returns undefined', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'State Owner',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId: projA,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    // Cross-project: case belongs to projA, caller passes projB
    const result = await getCaseReportState(projB, c.localId, 'FUNAI');
    expect(result).toBeUndefined();
  });

  it('getCaseReportState — correct project returns the row', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'State',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'complete',
    });

    const result = await getCaseReportState(projectLocalId, c.localId, 'FUNAI');
    expect(result).toBeDefined();
    expect(result!.status).toBe('complete');
  });

  it('getCaseReportStates — cross-project returns empty', async () => {
    const projA = await makeProject();
    const projB = await makeProject();
    const c = await createCase({
      projectLocalId: projA,
      title: 'States Owner',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId: projA,
      agency: 'FUNAI',
      status: 'incomplete',
    });

    // Cross-project: case belongs to projA, caller passes projB
    const result = await getCaseReportStates(projB, c.localId);
    expect(result).toEqual([]);
  });

  it('getCaseReportStates — correct project returns all agencies', async () => {
    const projectLocalId = await makeProject();
    const c = await createCase({
      projectLocalId,
      title: 'Multi State',
      caseType: 'illegal_mining',
    });

    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'FUNAI',
      status: 'incomplete',
    });
    await upsertCaseReportState({
      caseLocalId: c.localId,
      projectLocalId,
      agency: 'IBAMA',
      status: 'complete',
    });

    const result = await getCaseReportStates(projectLocalId, c.localId);
    expect(result).toHaveLength(2);
    const agencies = result.map((r) => r.agency).sort();
    expect(agencies).toEqual(['FUNAI', 'IBAMA']);
  });
});
