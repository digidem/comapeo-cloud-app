import * as v from 'valibot';

import type { Case } from '@/lib/db';
import {
  CASE_FACT_KEYS,
  type CaseFactKey,
  type ImmutableReportTemplate,
  REPORT_AGENCIES,
} from '@/lib/reports/template-registry';
import { geometrySchema } from '@/lib/schemas/geometry';

const SOURCE_TYPES = [
  'observation',
  'alert',
  'track',
  'case-context',
  'user-statement',
] as const;

export type CaseFactSourceType = (typeof SOURCE_TYPES)[number];

const nonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());
const caseFactKeySchema = v.picklist(CASE_FACT_KEYS);
const sourceTypeSchema = v.picklist(SOURCE_TYPES);

const LOCAL_OFFSET_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?([+-])(\d{2}):(\d{2})$/;

function hasValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isDateLike(value: string): boolean {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return hasValidDateParts(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
  }

  const dateTime = LOCAL_OFFSET_DATE_TIME_RE.exec(value);
  if (!dateTime) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    dateTime;
  return (
    hasValidDateParts(Number(year), Number(month), Number(day)) &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    (second === undefined || Number(second) <= 59) &&
    Number(offsetHour) <= 23 &&
    Number(offsetMinute) <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizeDate(value: string): string {
  return value.slice(0, 10);
}

// A report date is a civil/calendar date, not a UTC instant. Callers may pass
// YYYY-MM-DD directly or a date-time carrying the incident's explicit numeric
// local offset. UTC `Z` instants must be converted upstream where timezone
// context is known; guessing that timezone here could change the reported day.
const normalizedDateSchema = v.pipe(
  v.string(),
  v.trim(),
  v.check(isDateLike, 'Expected a valid ISO date or date-time'),
  v.transform(normalizeDate),
);

export const caseFactValueSchema = v.variant('kind', [
  v.object({
    kind: v.literal('text'),
    value: nonEmptyStringSchema,
  }),
  v.object({
    kind: v.literal('number'),
    value: v.pipe(v.number(), v.finite()),
  }),
  v.object({
    kind: v.literal('boolean'),
    value: v.boolean(),
  }),
  v.object({
    kind: v.literal('date'),
    value: normalizedDateSchema,
  }),
  v.pipe(
    v.object({
      kind: v.literal('date-range'),
      start: normalizedDateSchema,
      end: v.optional(normalizedDateSchema),
    }),
    v.check(
      (range) => range.end === undefined || range.start <= range.end,
      'Date range end must not precede start',
    ),
  ),
  v.object({
    kind: v.literal('location-summary'),
    value: nonEmptyStringSchema,
  }),
  v.object({
    kind: v.literal('geometry'),
    value: geometrySchema,
  }),
]);

export type CaseFactValue = v.InferOutput<typeof caseFactValueSchema>;

export const caseFactSourceInputSchema = v.object({
  type: sourceTypeSchema,
  id: nonEmptyStringSchema,
  versionId: v.optional(nonEmptyStringSchema),
});

export type CaseFactSourceInput = v.InferOutput<
  typeof caseFactSourceInputSchema
>;

export const approvedCaseFactInputSchema = v.object({
  key: caseFactKeySchema,
  value: caseFactValueSchema,
  source: caseFactSourceInputSchema,
});

export type ApprovedCaseFactInput = v.InferOutput<
  typeof approvedCaseFactInputSchema
>;

export const caseFactProvenanceSchema = v.object({
  id: nonEmptyStringSchema,
  sourceType: sourceTypeSchema,
  sourceId: nonEmptyStringSchema,
  sourceVersionId: v.optional(nonEmptyStringSchema),
});

export type CaseFactProvenance = v.InferOutput<typeof caseFactProvenanceSchema>;

export const caseFactSchema = v.object({
  key: caseFactKeySchema,
  value: caseFactValueSchema,
  provenance: v.pipe(v.array(caseFactProvenanceSchema), v.minLength(1)),
});

export type CaseFact = v.InferOutput<typeof caseFactSchema>;

// These keys may legitimately contain multiple independently sourced values.
// Every other key is single-valued: callers must select/aggregate narrative
// content upstream before it becomes one disclosure-approved Case Fact.
const MULTI_VALUED_CASE_FACT_KEYS = new Set<CaseFactKey>([
  'case.secondaryTypes',
  'impact.affectedResources',
  'actors.documented',
  'equipment.documented',
]);

function hasNoConflictingSingleValueFacts(facts: CaseFact[]): boolean {
  const valuesByKey = new Map<CaseFactKey, string>();

  for (const fact of facts) {
    if (MULTI_VALUED_CASE_FACT_KEYS.has(fact.key)) continue;
    const value = JSON.stringify(fact.value);
    const previous = valuesByKey.get(fact.key);
    if (previous !== undefined && previous !== value) return false;
    valuesByKey.set(fact.key, value);
  }

  return true;
}

export const missingCaseFactSchema = v.object({
  key: caseFactKeySchema,
  severity: v.picklist(['blocking', 'review']),
});

export type MissingCaseFact = v.InferOutput<typeof missingCaseFactSchema>;

// `caseLocalId`, `projectLocalId`, and provenance source IDs are audit/linkage
// metadata for internal consumers. Report renderers must not present these raw
// identifiers as submitted report content unless a later template explicitly
// defines a user-visible representation.
export const caseFactsSchema = v.object({
  schemaVersion: v.literal(1),
  caseLocalId: nonEmptyStringSchema,
  projectLocalId: nonEmptyStringSchema,
  template: v.object({
    templateId: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
    agency: v.picklist(REPORT_AGENCIES),
    outputLanguage: v.literal('pt-BR'),
  }),
  facts: v.pipe(
    v.array(caseFactSchema),
    v.check(
      hasNoConflictingSingleValueFacts,
      'Case Facts contain conflicting values for a single-valued key',
    ),
  ),
  missingInformation: v.array(missingCaseFactSchema),
});

export type CaseFacts = v.InferOutput<typeof caseFactsSchema>;

export interface BuildCaseFactsInput {
  case: Pick<Case, 'localId' | 'projectLocalId' | 'caseType'>;
  template: ImmutableReportTemplate;
  /**
   * Facts already selected, report-approved, and disclosure-transformed by the
   * evidence/disclosure owner (#269). Sensitive Case context such as the title
   * must enter through this list as an approved fact; this layer deliberately
   * makes no disclosure decision and has no access to project storage or the
   * network.
   */
  approvedFacts: readonly ApprovedCaseFactInput[];
}

function toProvenance(source: CaseFactSourceInput): CaseFactProvenance {
  return {
    id: `${source.type}:${source.id}`,
    sourceType: source.type,
    sourceId: source.id,
    ...(source.versionId === undefined
      ? {}
      : { sourceVersionId: source.versionId }),
  };
}

function canonicalValue(value: CaseFactValue): string {
  return JSON.stringify(value);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareProvenance(
  left: CaseFactProvenance,
  right: CaseFactProvenance,
): number {
  return (
    compareText(left.id, right.id) ||
    compareText(left.sourceVersionId ?? '', right.sourceVersionId ?? '')
  );
}

function provenanceIdentity(source: CaseFactProvenance): string {
  return `${source.id}\u0000${source.sourceVersionId ?? ''}`;
}

function normalizeFact(
  key: CaseFactKey,
  value: unknown,
  source: unknown,
): CaseFact {
  const parsedValue = v.parse(caseFactValueSchema, value);
  const parsedSource = v.parse(caseFactSourceInputSchema, source);
  return {
    key,
    value: parsedValue,
    provenance: [toProvenance(parsedSource)],
  };
}

function mergeAndSortFacts(candidates: readonly CaseFact[]): CaseFact[] {
  const grouped = new Map<string, CaseFact>();

  for (const candidate of candidates) {
    const groupKey = `${candidate.key}\u0000${canonicalValue(candidate.value)}`;
    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, {
        key: candidate.key,
        value: candidate.value,
        provenance: [...candidate.provenance].sort(compareProvenance),
      });
      continue;
    }

    const provenanceByIdentity = new Map(
      existing.provenance.map((source) => [provenanceIdentity(source), source]),
    );
    for (const source of candidate.provenance) {
      provenanceByIdentity.set(provenanceIdentity(source), source);
    }
    existing.provenance = [...provenanceByIdentity.values()].sort(
      compareProvenance,
    );
  }

  return [...grouped.values()].sort((left, right) => {
    return (
      compareText(left.key, right.key) ||
      compareText(left.provenance[0]!.id, right.provenance[0]!.id) ||
      compareText(canonicalValue(left.value), canonicalValue(right.value))
    );
  });
}

function isFactSatisfied(
  key: CaseFactKey,
  presentKeys: ReadonlySet<CaseFactKey>,
): boolean {
  if (presentKeys.has(key)) return true;
  if (key === 'incident.date') return presentKeys.has('incident.dateRange');
  if (key === 'incident.dateRange') return presentKeys.has('incident.date');
  return false;
}

function collectMissingInformation(
  template: ImmutableReportTemplate,
  facts: readonly CaseFact[],
): MissingCaseFact[] {
  const presentKeys = new Set(facts.map((fact) => fact.key));
  const missing: MissingCaseFact[] = [];

  for (const key of template.requiredFacts) {
    if (
      key === 'incident.dateRange' &&
      template.requiredFacts.includes('incident.date')
    ) {
      continue;
    }
    if (!isFactSatisfied(key, presentKeys)) {
      missing.push({ key, severity: 'blocking' });
    }
  }
  for (const key of template.optionalFacts) {
    if (
      key === 'incident.dateRange' &&
      template.optionalFacts.includes('incident.date')
    ) {
      continue;
    }
    if (!isFactSatisfied(key, presentKeys)) {
      missing.push({ key, severity: 'review' });
    }
  }

  return missing.sort(
    (left, right) =>
      compareText(left.key, right.key) ||
      compareText(left.severity, right.severity),
  );
}

export function buildCaseFacts(input: BuildCaseFactsInput): CaseFacts {
  if (!input.template.supportedCaseTypes.includes(input.case.caseType)) {
    throw new RangeError(
      `Case type ${input.case.caseType} is not supported by template ${input.template.templateId}@${input.template.version}`,
    );
  }

  const candidates: CaseFact[] = [
    normalizeFact(
      'case.primaryType',
      { kind: 'text', value: input.case.caseType },
      { type: 'case-context', id: 'primary-type' },
    ),
  ];

  for (const approvedFact of input.approvedFacts) {
    const parsed = v.parse(approvedCaseFactInputSchema, approvedFact);
    candidates.push(normalizeFact(parsed.key, parsed.value, parsed.source));
  }

  const facts = mergeAndSortFacts(candidates);
  const result: CaseFacts = {
    schemaVersion: 1,
    caseLocalId: input.case.localId,
    projectLocalId: input.case.projectLocalId,
    template: {
      templateId: input.template.templateId,
      version: input.template.version,
      agency: input.template.agency,
      outputLanguage: input.template.outputLanguage,
    },
    facts,
    missingInformation: collectMissingInformation(input.template, facts),
  };

  return v.parse(caseFactsSchema, result);
}
