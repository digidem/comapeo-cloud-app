import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';

import type { Case } from '@/lib/db';
import {
  approvedCaseFactInputSchema,
  buildCaseFacts,
  caseFactsSchema,
} from '@/lib/reports/case-facts';
import { getLatestReportTemplate } from '@/lib/reports/template-registry';

const testCase: Case = {
  localId: 'case-001',
  projectLocalId: 'project-001',
  title: '  Garimpo no rio  ',
  caseType: 'illegal_mining',
  status: 'active',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
  revision: 3,
  createdBy: 'local',
  deleted: false,
};

describe('buildCaseFacts', () => {
  it('includes only non-sensitive Case classification by default and treats title as disclosure-gated', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('FUNAI'),
      approvedFacts: [],
    });

    expect(result.caseLocalId).toBe('case-001');
    expect(result.projectLocalId).toBe('project-001');
    expect(result.facts).toContainEqual({
      key: 'case.primaryType',
      value: { kind: 'text', value: 'illegal_mining' },
      provenance: [
        {
          id: 'case-context:primary-type',
          sourceType: 'case-context',
          sourceId: 'primary-type',
        },
      ],
    });
    expect(result.facts.some((fact) => fact.key === 'case.title')).toBe(false);
    expect(result.missingInformation).toContainEqual({
      key: 'case.title',
      severity: 'blocking',
    });
  });

  it('uses the disclosure-approved Case title without leaking the raw Case title', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('FUNAI'),
      approvedFacts: [
        {
          key: 'case.title',
          value: { kind: 'text', value: 'Atividade no território' },
          source: { type: 'case-context', id: 'title' },
        },
      ],
    });

    expect(result.facts).toContainEqual({
      key: 'case.title',
      value: { kind: 'text', value: 'Atividade no território' },
      provenance: [
        {
          id: 'case-context:title',
          sourceType: 'case-context',
          sourceId: 'title',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Garimpo no rio');
    expect(result.missingInformation).not.toContainEqual({
      key: 'case.title',
      severity: 'blocking',
    });
  });

  it('rejects a Case type that the selected template does not support', () => {
    const template = {
      ...getLatestReportTemplate('FUNAI'),
      supportedCaseTypes: ['fire'] as const,
    };

    expect(() =>
      buildCaseFacts({ case: testCase, template, approvedFacts: [] }),
    ).toThrow(/not supported/i);
  });

  it('pins the exact selected template identity and validates the result at runtime', () => {
    const template = getLatestReportTemplate('IBAMA');
    const result = buildCaseFacts({
      case: testCase,
      template,
      approvedFacts: [],
    });

    expect(result.template).toEqual({
      templateId: 'br.ibama.report',
      version: '1.0.0',
      agency: 'IBAMA',
      outputLanguage: 'pt-BR',
    });
    expect(v.safeParse(caseFactsSchema, result).success).toBe(true);
  });

  it('creates stable typed provenance IDs and preserves source versions', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('MPF'),
      approvedFacts: [
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: '  Primeiro registro em campo.  ' },
          source: {
            type: 'observation',
            id: 'obs-7',
            versionId: 'version-3',
          },
        },
        {
          key: 'incident.recurrence',
          value: { kind: 'boolean', value: true },
          source: { type: 'alert', id: 'alert-2' },
        },
        {
          key: 'location.summary',
          value: { kind: 'location-summary', value: '  Terra Indígena X  ' },
          source: { type: 'track', id: 'track-5', versionId: 'track-v2' },
        },
        {
          key: 'action.requested',
          value: { kind: 'text', value: 'Solicitar providências.' },
          source: { type: 'user-statement', id: 'statement-9' },
        },
      ],
    });

    const byKey = new Map(result.facts.map((fact) => [fact.key, fact]));
    expect(byKey.get('incident.chronology')).toMatchObject({
      value: { kind: 'text', value: 'Primeiro registro em campo.' },
      provenance: [
        {
          id: 'observation:obs-7',
          sourceType: 'observation',
          sourceId: 'obs-7',
          sourceVersionId: 'version-3',
        },
      ],
    });
    expect(byKey.get('incident.recurrence')?.provenance[0]?.id).toBe(
      'alert:alert-2',
    );
    expect(byKey.get('location.summary')).toMatchObject({
      value: { kind: 'location-summary', value: 'Terra Indígena X' },
      provenance: [
        {
          id: 'track:track-5',
          sourceVersionId: 'track-v2',
        },
      ],
    });
    expect(byKey.get('action.requested')?.provenance[0]?.id).toBe(
      'user-statement:statement-9',
    );
  });

  it('is byte-deterministic across input order and merges duplicate-value provenance', () => {
    const first = {
      key: 'incident.chronology' as const,
      value: { kind: 'text' as const, value: 'Atividade observada.' },
      source: { type: 'observation' as const, id: 'obs-b', versionId: 'v2' },
    };
    const second = {
      key: 'incident.chronology' as const,
      value: { kind: 'text' as const, value: 'Atividade observada.' },
      source: { type: 'alert' as const, id: 'alert-a' },
    };
    const third = {
      key: 'location.summary' as const,
      value: { kind: 'location-summary' as const, value: 'Área norte' },
      source: { type: 'track' as const, id: 'track-c' },
    };
    const template = getLatestReportTemplate('PF');

    const a = buildCaseFacts({
      case: testCase,
      template,
      approvedFacts: [first, second, third],
    });
    const b = buildCaseFacts({
      case: testCase,
      template,
      approvedFacts: [third, second, first],
    });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const chronology = a.facts.find(
      (fact) => fact.key === 'incident.chronology',
    );
    expect(chronology?.provenance.map((source) => source.id)).toEqual([
      'alert:alert-a',
      'observation:obs-b',
    ]);
    expect(
      a.facts.filter((fact) => fact.key === 'incident.chronology'),
    ).toHaveLength(1);
  });

  it('normalizes dates/date ranges and validates disclosed GeoJSON geometry', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('IBAMA'),
      approvedFacts: [
        {
          key: 'incident.date',
          value: { kind: 'date', value: '2026-08-21T23:30:00-03:00' },
          source: { type: 'observation', id: 'obs-date' },
        },
        {
          key: 'incident.dateRange',
          value: {
            kind: 'date-range',
            start: '2026-08-20',
            end: '2026-08-22T10:00:00-03:00',
          },
          source: { type: 'case-context', id: 'date-range' },
        },
        {
          key: 'location.geometry',
          value: {
            kind: 'geometry',
            value: { type: 'Point', coordinates: [-48.5, -1.4] },
          },
          source: { type: 'alert', id: 'alert-geometry' },
        },
      ],
    });

    expect(
      result.facts.find((fact) => fact.key === 'incident.date')?.value,
    ).toEqual({ kind: 'date', value: '2026-08-21' });
    expect(
      result.facts.find((fact) => fact.key === 'incident.dateRange')?.value,
    ).toEqual({ kind: 'date-range', start: '2026-08-20', end: '2026-08-22' });
    expect(
      result.facts.find((fact) => fact.key === 'location.geometry')?.value,
    ).toEqual({
      kind: 'geometry',
      value: { type: 'Point', coordinates: [-48.5, -1.4] },
    });
  });

  it('rejects non-ISO dates, UTC date-times without civil-time context, and reversed date ranges', () => {
    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        key: 'incident.date',
        value: { kind: 'date', value: 'August 27 2026' },
        source: { type: 'case-context', id: 'incident-date' },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        key: 'incident.date',
        value: { kind: 'date', value: '2026-08-22T01:30:00.000Z' },
        source: { type: 'observation', id: 'obs-utc' },
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        key: 'incident.dateRange',
        value: {
          kind: 'date-range',
          start: '2026-08-28',
          end: '2026-08-27',
        },
        source: { type: 'case-context', id: 'incident-range' },
      }).success,
    ).toBe(false);
  });

  it('uses locale-independent code-point ordering for provenance IDs', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('MPF'),
      approvedFacts: [
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Mesmo fato.' },
          source: { type: 'observation', id: 'á' },
        },
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Mesmo fato.' },
          source: { type: 'observation', id: 'z' },
        },
      ],
    });

    expect(
      result.facts
        .find((fact) => fact.key === 'incident.chronology')
        ?.provenance.map((source) => source.id),
    ).toEqual(['observation:z', 'observation:á']);
  });

  it('orders distinct versions of the same source deterministically', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('MPF'),
      approvedFacts: [
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Mesmo fato versionado.' },
          source: { type: 'observation', id: 'obs-1', versionId: 'v2' },
        },
        {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Mesmo fato versionado.' },
          source: { type: 'observation', id: 'obs-1', versionId: 'v1' },
        },
      ],
    });

    expect(
      result.facts
        .find(
          (fact) =>
            fact.value.kind === 'text' &&
            fact.value.value === 'Mesmo fato versionado.',
        )
        ?.provenance.map((source) => source.sourceVersionId),
    ).toEqual(['v1', 'v2']);
  });

  it('fails closed when one Case Fact key has conflicting approved values', () => {
    expect(() =>
      buildCaseFacts({
        case: testCase,
        template: getLatestReportTemplate('MPF'),
        approvedFacts: [
          {
            key: 'incident.date',
            value: { kind: 'date', value: '2026-08-20' },
            source: { type: 'observation', id: 'obs-1' },
          },
          {
            key: 'incident.date',
            value: { kind: 'date', value: '2026-08-21' },
            source: { type: 'observation', id: 'obs-2' },
          },
        ],
      }),
    ).toThrow(/conflicting/i);
  });

  it('rejects arbitrary objects, binary values, blank source IDs, and invalid geometry', () => {
    const base = {
      key: 'evidence.summary',
      source: { type: 'observation', id: 'obs-1' },
    };

    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        ...base,
        value: { kind: 'object', value: { authorization: 'Bearer secret' } },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        ...base,
        value: { kind: 'binary', value: new Uint8Array([1, 2, 3]) },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        ...base,
        value: { kind: 'text', value: 'Evidence' },
        source: { type: 'observation', id: '   ' },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(approvedCaseFactInputSchema, {
        key: 'location.geometry',
        value: {
          kind: 'geometry',
          value: { type: 'Point', coordinates: [999, 999] },
        },
        source: { type: 'alert', id: 'alert-1' },
      }).success,
    ).toBe(false);
  });

  it('surfaces required missing facts as blocking and optional ones as review without fabricating values', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('FUNAI'),
      approvedFacts: [],
    });

    expect(result.missingInformation).toContainEqual({
      key: 'impact.threats',
      severity: 'blocking',
    });
    expect(result.missingInformation).toContainEqual({
      key: 'incident.date',
      severity: 'review',
    });
    expect(result.missingInformation).not.toContainEqual({
      key: 'incident.dateRange',
      severity: 'review',
    });
    expect(result.missingInformation).toContainEqual({
      key: 'urgency.context',
      severity: 'review',
    });
    expect(result.facts.some((fact) => fact.key === 'impact.threats')).toBe(
      false,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /unknown|not provided|não informado/i,
    );
  });

  it('treats an approved incident date range as satisfying the template date review item', () => {
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('FUNAI'),
      approvedFacts: [
        {
          key: 'incident.dateRange',
          value: {
            kind: 'date-range',
            start: '2026-08-20',
            end: '2026-08-22',
          },
          source: { type: 'case-context', id: 'incident-range' },
        },
      ],
    });

    expect(result.missingInformation).not.toContainEqual({
      key: 'incident.date',
      severity: 'review',
    });
  });

  it('is a synchronous pure transformation and never invokes fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = buildCaseFacts({
      case: testCase,
      template: getLatestReportTemplate('FUNAI'),
      approvedFacts: [],
    });

    expect(result).not.toBeInstanceOf(Promise);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
