import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  applyCaseDisclosure,
  buildDisclosureSafeMapGeometry,
  caseReportDisclosureSchema,
} from '@/lib/case-disclosure';
import type { ApprovedCaseFactInput } from '@/lib/reports/case-facts';

const source = {
  type: 'observation' as const,
  id: 'observation-1',
  versionId: 'v1',
};

describe('Case report disclosure', () => {
  it('runtime-validates minimum-disclosure settings', () => {
    const parsed = v.parse(caseReportDisclosureSchema, {
      reporterIdentity: 'omit',
      locationMode: 'omit',
      people: [],
      media: [],
      sensitiveFields: [],
    });
    expect(parsed.locationMode).toBe('omit');
    expect(parsed.reporterIdentity).toBe('omit');
  });

  it('never emits exact geometry for Area only or Omit and never derives a generalized geometry', () => {
    const exact = {
      type: 'Point' as const,
      coordinates: [-60.123456, -3.123456],
    };
    const approvedBoundary = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-61, -4],
          [-59, -4],
          [-59, -2],
          [-61, -2],
          [-61, -4],
        ],
      ],
    };

    expect(
      buildDisclosureSafeMapGeometry({
        mode: 'omit',
        exactGeometry: exact,
        approvedGeneralizedGeometry: approvedBoundary,
      }),
    ).toBeUndefined();
    expect(
      buildDisclosureSafeMapGeometry({ mode: 'area', exactGeometry: exact }),
    ).toBeUndefined();
    expect(
      buildDisclosureSafeMapGeometry({
        mode: 'area',
        exactGeometry: exact,
        approvedGeneralizedGeometry: approvedBoundary,
      }),
    ).toEqual(approvedBoundary);
    expect(
      buildDisclosureSafeMapGeometry({ mode: 'exact', exactGeometry: exact }),
    ).toEqual(exact);
  });

  it('filters identity, people, sensitive fields, and exact location per agency', () => {
    const exactGeometryFact: ApprovedCaseFactInput = {
      key: 'location.geometry',
      value: {
        kind: 'geometry',
        value: { type: 'Point', coordinates: [-60.123456, -3.123456] },
      },
      source,
    };
    const candidates = [
      {
        fact: {
          key: 'case.context',
          value: { kind: 'text', value: 'Reporter name' },
          source: { type: 'case-context', id: 'reporter' },
        } satisfies ApprovedCaseFactInput,
        disclosure: { kind: 'reporter-identity' as const },
      },
      {
        fact: {
          key: 'actors.documented',
          value: { kind: 'text', value: 'Witness name' },
          source,
        } satisfies ApprovedCaseFactInput,
        disclosure: { kind: 'person' as const, id: 'witness-a' },
      },
      {
        fact: {
          key: 'incident.chronology',
          value: { kind: 'text', value: 'Sensitive detail' },
          source,
        } satisfies ApprovedCaseFactInput,
        disclosure: { kind: 'sensitive-field' as const, id: 'detail-a' },
      },
      {
        fact: exactGeometryFact,
        disclosure: { kind: 'location-exact' as const },
      },
      {
        fact: {
          key: 'location.summary',
          value: { kind: 'location-summary', value: 'Approved area summary' },
          source: { type: 'case-context', id: 'area-summary' },
        } satisfies ApprovedCaseFactInput,
        disclosure: { kind: 'location-area-summary' as const },
      },
      {
        fact: {
          key: 'case.title',
          value: { kind: 'text', value: 'Approved case title' },
          source: { type: 'case-context', id: 'title' },
        } satisfies ApprovedCaseFactInput,
      },
    ];

    const output = applyCaseDisclosure(candidates, {
      reporterIdentity: 'omit',
      locationMode: 'area',
      people: [{ id: 'witness-a', include: false }],
      media: [{ id: 'media-1', include: false }],
      sensitiveFields: [{ id: 'detail-a', include: false }],
    });

    expect(output.map((fact) => fact.key)).toEqual([
      'location.summary',
      'case.title',
    ]);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('-60.123456');
    expect(serialized).not.toContain('Reporter name');
    expect(serialized).not.toContain('Witness name');
    expect(serialized).not.toContain('Sensitive detail');
    expect(exactGeometryFact.value).toEqual({
      kind: 'geometry',
      value: { type: 'Point', coordinates: [-60.123456, -3.123456] },
    });
  });

  it('fails closed when location facts are not explicitly tagged', () => {
    const untaggedLocation = {
      fact: {
        key: 'location.geometry',
        value: {
          kind: 'geometry',
          value: { type: 'Point', coordinates: [-60.1, -3.1] },
        },
        source,
      } satisfies ApprovedCaseFactInput,
    };

    expect(() =>
      applyCaseDisclosure([untaggedLocation], {
        reporterIdentity: 'include',
        locationMode: 'exact',
        people: [],
        media: [],
        sensitiveFields: [],
      }),
    ).toThrow(/location disclosure/i);
  });
});
