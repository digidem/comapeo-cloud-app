import * as v from 'valibot';

import type { ApprovedCaseFactInput } from '@/lib/reports/case-facts';
import { geometrySchema } from '@/lib/schemas/geometry';

const nonEmptyIdSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());
const decisionSchema = v.object({
  id: nonEmptyIdSchema,
  include: v.boolean(),
});

export const caseReportDisclosureSchema = v.object({
  reporterIdentity: v.picklist(['include', 'omit']),
  locationMode: v.picklist(['exact', 'area', 'omit']),
  people: v.array(decisionSchema),
  media: v.array(decisionSchema),
  sensitiveFields: v.array(decisionSchema),
});

export type CaseReportDisclosure = v.InferOutput<
  typeof caseReportDisclosureSchema
>;
export type CaseLocationDisclosureMode = CaseReportDisclosure['locationMode'];
export type CaseDisclosureGeometry = v.InferOutput<typeof geometrySchema>;

export type CaseFactDisclosure =
  | { kind: 'reporter-identity' }
  | { kind: 'person'; id: string }
  | { kind: 'sensitive-field'; id: string }
  | { kind: 'media'; id: string }
  | { kind: 'location-exact' }
  | { kind: 'location-area-summary' }
  | { kind: 'location-approved-boundary' };

export interface DisclosureCandidateFact {
  fact: ApprovedCaseFactInput;
  disclosure?: CaseFactDisclosure;
}

function includedByDecision(
  decisions: readonly { id: string; include: boolean }[],
  id: string,
): boolean {
  return decisions.find((decision) => decision.id === id)?.include === true;
}

function isLocationFact(fact: ApprovedCaseFactInput): boolean {
  return fact.key === 'location.geometry' || fact.key === 'location.summary';
}

/**
 * Apply report-specific disclosure before Case Facts/provider assembly. Unknown
 * people/media/sensitive decisions default to excluded. Location facts must be
 * explicitly tagged so exact coordinates can never cross this seam by accident.
 */
export function applyCaseDisclosure(
  candidates: readonly DisclosureCandidateFact[],
  rawDisclosure: CaseReportDisclosure,
): ApprovedCaseFactInput[] {
  const disclosure = v.parse(caseReportDisclosureSchema, rawDisclosure);
  const output: ApprovedCaseFactInput[] = [];

  for (const candidate of candidates) {
    const { fact } = candidate;
    const rule = candidate.disclosure;
    if (isLocationFact(fact) && !rule?.kind.startsWith('location-')) {
      throw new Error(
        `Location disclosure must be explicit for Case Fact "${fact.key}"`,
      );
    }

    let include = true;
    switch (rule?.kind) {
      case 'reporter-identity':
        include = disclosure.reporterIdentity === 'include';
        break;
      case 'person':
        include = includedByDecision(disclosure.people, rule.id);
        break;
      case 'sensitive-field':
        include = includedByDecision(disclosure.sensitiveFields, rule.id);
        break;
      case 'media':
        include = includedByDecision(disclosure.media, rule.id);
        break;
      case 'location-exact':
        include = disclosure.locationMode === 'exact';
        break;
      case 'location-area-summary':
        include =
          disclosure.locationMode === 'area' ||
          disclosure.locationMode === 'exact';
        break;
      case 'location-approved-boundary':
        include = disclosure.locationMode === 'area';
        break;
      case undefined:
        include = true;
        break;
    }
    if (include) output.push(fact);
  }

  return output;
}

/**
 * Produce map-safe geometry from a location decision. Area-only never rounds or
 * derives from exact geometry: it can use only a separately supplied,
 * user-approved generalized geometry. Omit always yields no geometry.
 */
export function buildDisclosureSafeMapGeometry(input: {
  mode: CaseLocationDisclosureMode;
  exactGeometry?: CaseDisclosureGeometry;
  approvedGeneralizedGeometry?: CaseDisclosureGeometry;
}): CaseDisclosureGeometry | undefined {
  if (input.mode === 'omit') return undefined;
  if (input.mode === 'area') {
    return input.approvedGeneralizedGeometry === undefined
      ? undefined
      : v.parse(geometrySchema, input.approvedGeneralizedGeometry);
  }
  return input.exactGeometry === undefined
    ? undefined
    : v.parse(geometrySchema, input.exactGeometry);
}
