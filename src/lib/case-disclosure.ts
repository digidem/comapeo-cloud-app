import * as v from 'valibot';

import type { ApprovedCaseFactInput } from '@/lib/reports/case-facts';
import { geometrySchema } from '@/lib/schemas/geometry';

const nonEmptyIdSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());
const decisionSchema = v.object({
  id: nonEmptyIdSchema,
  include: v.boolean(),
});

const approvedAreaProvenanceSchema = v.object({
  origin: v.literal('independent-user-approved'),
  sourceId: nonEmptyIdSchema,
  sourceVersionId: v.optional(nonEmptyIdSchema),
  approvedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const approvedAreaDisclosureSchema = v.variant('kind', [
  v.object({
    kind: v.literal('geometry'),
    geometry: geometrySchema,
    provenance: approvedAreaProvenanceSchema,
  }),
  v.object({
    kind: v.literal('summary'),
    summary: nonEmptyIdSchema,
    provenance: approvedAreaProvenanceSchema,
  }),
]);

export const caseReportDisclosureSchema = v.object({
  reporterIdentity: v.picklist(['include', 'omit']),
  locationMode: v.picklist(['exact', 'area', 'omit']),
  people: v.array(decisionSchema),
  media: v.array(decisionSchema),
  sensitiveFields: v.array(decisionSchema),
  /**
   * Separately approved area material. This is deliberately optional: choosing
   * Area only without an approved independent area remains fail-closed and
   * produces no area geometry/summary.
   */
  approvedArea: v.optional(approvedAreaDisclosureSchema),
});

export type CaseReportDisclosure = v.InferOutput<
  typeof caseReportDisclosureSchema
>;
export type CaseLocationDisclosureMode = CaseReportDisclosure['locationMode'];
export type CaseDisclosureGeometry = v.InferOutput<typeof geometrySchema>;
export type CaseApprovedAreaDisclosure = v.InferOutput<
  typeof approvedAreaDisclosureSchema
>;

export type CaseFactDisclosure =
  | { kind: 'public' }
  | { kind: 'reporter-identity' }
  | { kind: 'person'; id: string }
  | { kind: 'sensitive-field'; id: string }
  | { kind: 'media'; id: string }
  | { kind: 'location-exact' }
  | { kind: 'location-area-summary' }
  | { kind: 'location-approved-boundary' };

export interface DisclosureCandidateFact {
  fact: ApprovedCaseFactInput;
  disclosure: CaseFactDisclosure;
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

function approvedAreaSourceMatches(
  fact: ApprovedCaseFactInput,
  approvedArea: CaseApprovedAreaDisclosure,
): boolean {
  return (
    fact.source.id === approvedArea.provenance.sourceId &&
    fact.source.versionId === approvedArea.provenance.sourceVersionId
  );
}

function approvedAreaFactMatches(
  fact: ApprovedCaseFactInput,
  approvedArea: CaseApprovedAreaDisclosure | undefined,
): boolean {
  if (!approvedArea || !approvedAreaSourceMatches(fact, approvedArea)) {
    return false;
  }
  if (approvedArea.kind === 'summary') {
    return (
      fact.key === 'location.summary' &&
      fact.value.kind === 'location-summary' &&
      fact.value.value === approvedArea.summary
    );
  }
  return (
    fact.key === 'location.geometry' &&
    fact.value.kind === 'geometry' &&
    JSON.stringify(fact.value.value) === JSON.stringify(approvedArea.geometry)
  );
}

/**
 * Apply report-specific disclosure before Case Facts/provider assembly. Every
 * candidate must carry an explicit classification; omission is an error rather
 * than an implicit public/default path. Unknown people/media/sensitive decisions
 * default to excluded. Area-only material must match the separately persisted,
 * independently user-approved area provenance exactly.
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
    if (!rule) {
      throw new Error(
        `Disclosure classification is required for Case Fact "${fact.key}"`,
      );
    }

    let include = false;
    switch (rule.kind) {
      case 'public':
        include = true;
        break;
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
          (disclosure.locationMode === 'area' ||
            disclosure.locationMode === 'exact') &&
          disclosure.approvedArea?.kind === 'summary' &&
          approvedAreaFactMatches(fact, disclosure.approvedArea);
        break;
      case 'location-approved-boundary':
        include =
          disclosure.locationMode === 'area' &&
          disclosure.approvedArea?.kind === 'geometry' &&
          approvedAreaFactMatches(fact, disclosure.approvedArea);
        break;
    }
    if (include) output.push(fact);
  }

  return output;
}

/**
 * Produce map-safe geometry from a location decision. Area-only never rounds or
 * derives from exact geometry: it can use only a separately persisted area
 * object carrying explicit independent user-approval provenance. Omit always
 * yields no geometry.
 */
export function buildDisclosureSafeMapGeometry(input: {
  mode: CaseLocationDisclosureMode;
  exactGeometry?: CaseDisclosureGeometry;
  approvedArea?: CaseApprovedAreaDisclosure;
}): CaseDisclosureGeometry | undefined {
  if (input.mode === 'omit') return undefined;
  if (input.mode === 'area') {
    if (input.approvedArea?.kind !== 'geometry') return undefined;
    const approved = v.parse(approvedAreaDisclosureSchema, input.approvedArea);
    return approved.kind === 'geometry' ? approved.geometry : undefined;
  }
  return input.exactGeometry === undefined
    ? undefined
    : v.parse(geometrySchema, input.exactGeometry);
}
