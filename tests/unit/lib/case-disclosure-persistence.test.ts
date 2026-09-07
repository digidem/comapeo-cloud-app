import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import {
  getCaseReportDisclosure,
  upsertCaseReportDisclosure,
} from '@/lib/local-repositories';

beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const db = getDb();
  await db.projects.add({
    localId: 'project-1',
    sourceType: 'local',
    sourceId: 'local',
    name: 'Project',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
  });
  await db.cases.add({
    localId: 'case-1',
    projectLocalId: 'project-1',
    title: 'Case',
    caseType: 'fire',
    status: 'draft',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    revision: 1,
    createdBy: 'local',
    deleted: false,
  });
}

describe('Case report disclosure persistence', () => {
  it('is independently stored per agency and starts fail-closed', async () => {
    await seed();

    expect(
      await getCaseReportDisclosure('project-1', 'case-1', 'FUNAI'),
    ).toMatchObject({
      reporterIdentity: 'omit',
      locationMode: 'omit',
      people: [],
      media: [],
      sensitiveFields: [],
      revision: 0,
    });

    const funai = await upsertCaseReportDisclosure({
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI',
      disclosure: {
        reporterIdentity: 'include',
        locationMode: 'area',
        approvedArea: {
          kind: 'geometry',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -2],
                [-61, -4],
              ],
            ],
          },
          provenance: {
            origin: 'independent-user-approved',
            sourceId: 'community-boundary-1',
            sourceVersionId: 'v3',
            approvedAt: '2026-09-05T12:00:00.000Z',
          },
        },
        people: [{ id: 'person-a', include: true }],
        media: [{ id: 'attachment-a', include: true }],
        sensitiveFields: [{ id: 'field-a', include: false }],
      },
    });
    expect(funai.revision).toBe(1);
    expect(funai.locationMode).toBe('area');
    expect(funai.approvedArea).toMatchObject({
      kind: 'geometry',
      provenance: {
        origin: 'independent-user-approved',
        sourceId: 'community-boundary-1',
        sourceVersionId: 'v3',
        approvedAt: '2026-09-05T12:00:00.000Z',
      },
    });
    expect(
      (await getCaseReportDisclosure('project-1', 'case-1', 'FUNAI'))
        .approvedArea,
    ).toEqual(funai.approvedArea);

    expect(
      await getCaseReportDisclosure('project-1', 'case-1', 'IBAMA'),
    ).toMatchObject({
      reporterIdentity: 'omit',
      locationMode: 'omit',
      revision: 0,
    });
  });

  it('rejects a case/project mismatch and records only metadata activity', async () => {
    await seed();
    await getDb().projects.add({
      localId: 'project-2',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Other project',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      dirtyLocal: true,
      deleted: false,
    });

    await expect(
      upsertCaseReportDisclosure({
        projectLocalId: 'project-2',
        caseLocalId: 'case-1',
        agency: 'PF',
        disclosure: {
          reporterIdentity: 'include',
          locationMode: 'exact',
          people: [{ id: 'person-secret', include: true }],
          media: [],
          sensitiveFields: [],
        },
      }),
    ).rejects.toThrow();

    await upsertCaseReportDisclosure({
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      agency: 'PF',
      disclosure: {
        reporterIdentity: 'include',
        locationMode: 'exact',
        people: [{ id: 'person-secret', include: true }],
        media: [],
        sensitiveFields: [],
      },
    });
    const activity = await getDb()
      .caseActivity.where('caseLocalId')
      .equals('case-1')
      .toArray();
    const disclosureActivity = activity.find(
      (item) => item.event === 'disclosure_changed',
    );
    expect(disclosureActivity).toMatchObject({ agency: 'PF' });
    expect(disclosureActivity).not.toHaveProperty('people');
    expect(JSON.stringify(disclosureActivity)).not.toContain('person-secret');
  });

  it('serializes concurrent disclosure updates so revisions cannot be lost', async () => {
    await seed();
    const base = {
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI' as const,
      disclosure: {
        reporterIdentity: 'omit' as const,
        locationMode: 'omit' as const,
        people: [],
        media: [],
        sensitiveFields: [],
      },
    };
    await upsertCaseReportDisclosure(base);

    const [first, second] = await Promise.all([
      upsertCaseReportDisclosure({
        ...base,
        disclosure: { ...base.disclosure, reporterIdentity: 'include' },
      }),
      upsertCaseReportDisclosure({
        ...base,
        disclosure: { ...base.disclosure, locationMode: 'exact' },
      }),
    ]);

    expect([first.revision, second.revision].sort()).toEqual([2, 3]);
    expect(
      (await getCaseReportDisclosure('project-1', 'case-1', 'FUNAI')).revision,
    ).toBe(3);
  });
});
