import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import type { CaseAgency, CaseType } from '@/lib/db';
import {
  BRAZIL_REPORT_TEMPLATES,
  getLatestReportTemplate,
  getReportTemplate,
  getSubmissionGuidanceStatus,
  reportTemplateSchema,
} from '@/lib/reports/template-registry';

const agencies: CaseAgency[] = ['FUNAI', 'IBAMA', 'MPF', 'PF'];
const caseTypes: CaseType[] = [
  'invasion_occupation',
  'territorial_encroachment',
  'deforestation_logging',
  'illegal_mining',
  'fire',
  'wildlife_exploitation',
  'pollution_contamination',
  'threats_violence',
  'rights_violation',
  'other',
];

describe('Brazil v1 report template registry', () => {
  it('ships one immutable v1 template for each supported agency', () => {
    expect(BRAZIL_REPORT_TEMPLATES).toHaveLength(4);
    expect(BRAZIL_REPORT_TEMPLATES.map((template) => template.agency)).toEqual(
      agencies,
    );

    for (const template of BRAZIL_REPORT_TEMPLATES) {
      expect(template.country).toBe('BR');
      expect(template.outputLanguage).toBe('pt-BR');
      expect(template.version).toBe('1.0.0');
      expect(template.lastReviewedAt).toBe('2026-08-27');
      expect(template.supportedCaseTypes).toEqual(caseTypes);
      expect(template.sections.length).toBeGreaterThan(0);
      expect(template.drafting.mayDiagnoseLegalViolation).toBe(false);
      expect(template.drafting.mayConcludeOffense).toBe(false);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.sections)).toBe(true);
      expect(Object.isFrozen(template.submission.guidance)).toBe(true);
    }
  });

  it('keeps user-facing submission and disclosure guidance localized in en/pt/es', () => {
    for (const template of BRAZIL_REPORT_TEMPLATES) {
      for (const locale of ['en', 'pt', 'es'] as const) {
        expect(template.submission.guidance[locale].trim()).not.toBe('');
        expect(template.submission.verifyWarning[locale].trim()).not.toBe('');
        expect(template.disclosureReviewPrompt[locale].trim()).not.toBe('');
      }
    }
  });

  it('stores official source and destination metadata for every agency', () => {
    for (const template of BRAZIL_REPORT_TEMPLATES) {
      expect(new URL(template.submission.officialSourceUrl).protocol).toBe(
        'https:',
      );
      expect(new URL(template.submission.destinationUrl).protocol).toBe(
        'https:',
      );
    }

    expect(
      getLatestReportTemplate('FUNAI').submission.officialSourceUrl,
    ).toContain('gov.br/funai');
    expect(
      getLatestReportTemplate('IBAMA').submission.officialSourceUrl,
    ).toContain('gov.br/ibama');
    expect(
      getLatestReportTemplate('MPF').submission.officialSourceUrl,
    ).toContain('mpf.mp.br');
    expect(
      getLatestReportTemplate('PF').submission.officialSourceUrl,
    ).toContain('gov.br/pf');
  });

  it('keeps PF jurisdiction verification as user guidance instead of a legal conclusion', () => {
    const pf = getLatestReportTemplate('PF');

    expect(pf.submission.guidance.pt).toMatch(/verifi/i);
    expect(pf.submission.guidance.pt).toMatch(/atribui|compet/i);
    expect(pf.drafting.mayDiagnoseLegalViolation).toBe(false);
    expect(pf.drafting.mayConcludeOffense).toBe(false);
  });

  it('retrieves an exact immutable version without silently migrating it', () => {
    const funai = getReportTemplate('FUNAI', '1.0.0');

    expect(funai).toBe(BRAZIL_REPORT_TEMPLATES[0]);
    expect(getReportTemplate('FUNAI', '2.0.0')).toBeUndefined();
    expect(getLatestReportTemplate('FUNAI')).toBe(funai);
  });

  it('rejects malformed template data at the runtime boundary', () => {
    const valid = getLatestReportTemplate('IBAMA');
    const malformed = {
      ...valid,
      version: '',
      supportedCaseTypes: ['not-a-case-type'],
      submission: {
        ...valid.submission,
        officialSourceUrl: 'javascript:alert(1)',
      },
    };

    const parsed = v.safeParse(reportTemplateSchema, malformed);
    expect(parsed.success).toBe(false);
    expect(
      v.safeParse(reportTemplateSchema, {
        ...valid,
        lastReviewedAt: '2026-02-31',
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(reportTemplateSchema, {
        ...valid,
        submission: { ...valid.submission, officialSourceUrl: 'not a url' },
      }).success,
    ).toBe(false);
  });

  it('fails closed for an agency that is not registered', () => {
    expect(() =>
      getLatestReportTemplate('UNKNOWN' as unknown as CaseAgency),
    ).toThrow('No report template registered');
  });

  it('deep-freezes nested template content at runtime', () => {
    const template = getLatestReportTemplate('MPF');
    const originalTitle = template.sections[0]!.title;

    expect(() => {
      (template.sections as unknown as Array<{ title: string }>)[0]!.title =
        'mutated';
    }).toThrow(TypeError);
    expect(template.sections[0]!.title).toBe(originalTitle);
  });
});

describe('submission guidance staleness', () => {
  it('is fresh at exactly 180 whole UTC days and stale at 181 days', () => {
    const template = getLatestReportTemplate('FUNAI');

    expect(
      getSubmissionGuidanceStatus(template, new Date('2027-02-23T23:59:59Z')),
    ).toMatchObject({ stale: false, ageDays: 180 });
    expect(
      getSubmissionGuidanceStatus(template, new Date('2027-02-24T00:00:00Z')),
    ).toMatchObject({
      stale: true,
      ageDays: 181,
      officialSourceUrl: template.submission.officialSourceUrl,
    });
  });

  it('fails closed when the current date is invalid', () => {
    expect(() =>
      getSubmissionGuidanceStatus(
        getLatestReportTemplate('FUNAI'),
        new Date(Number.NaN),
      ),
    ).toThrow(RangeError);
  });
});
