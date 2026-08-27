import { describe, expect, it } from 'vitest';

import type { Case } from '@/lib/db';
import {
  BRAZIL_REPORT_TEMPLATES,
  buildCaseFacts,
  getLatestReportTemplate,
  getReportTemplate,
  getSubmissionGuidanceStatus,
} from '@/lib/reports';

describe('reports public domain seam', () => {
  it('selects a versioned agency template and builds Case Facts through public exports', () => {
    const caze: Case = {
      localId: 'case-public',
      projectLocalId: 'project-public',
      title: 'Caso de teste',
      caseType: 'fire',
      status: 'draft',
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
      revision: 1,
      createdBy: 'local',
      deleted: false,
    };
    const latest = getLatestReportTemplate('IBAMA');
    const exact = getReportTemplate('IBAMA', latest.version);
    const facts = buildCaseFacts({
      case: caze,
      template: latest,
      approvedFacts: [
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Fogo observado em campo.' },
          source: { type: 'observation', id: 'obs-public' },
        },
      ],
    });

    expect(BRAZIL_REPORT_TEMPLATES).toHaveLength(4);
    expect(exact).toBe(latest);
    expect(facts.template).toMatchObject({
      templateId: latest.templateId,
      version: latest.version,
      agency: 'IBAMA',
    });
    expect(facts.missingInformation).not.toContainEqual({
      key: 'incident.chronology',
      severity: 'blocking',
    });
    expect(
      getSubmissionGuidanceStatus(latest, new Date('2026-08-27')),
    ).toMatchObject({ stale: false, ageDays: 0 });
  });
});
