import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCaseReportDisclosure } from '@/hooks/useCaseReportDisclosure';
import { useUpsertCaseReportDisclosure } from '@/hooks/useUpsertCaseReportDisclosure';
import type { CaseReportDisclosure } from '@/lib/case-disclosure';
import type { CaseAgency } from '@/lib/db';

export interface DisclosureCandidate {
  id: string;
  label: string;
}

interface CaseReportDisclosurePanelProps {
  projectLocalId: string;
  caseLocalId: string;
  agency: CaseAgency;
  people?: readonly DisclosureCandidate[];
  media?: readonly DisclosureCandidate[];
  sensitiveFields?: readonly DisclosureCandidate[];
}

const EMPTY_CANDIDATES: readonly DisclosureCandidate[] = [];

const messages = defineMessages({
  title: {
    id: 'cases.disclosure.title',
    defaultMessage: 'Disclosure for {agency}',
  },
  reporterIdentity: {
    id: 'cases.disclosure.reporterIdentity',
    defaultMessage: 'Reporter identity',
  },
  includeReporterIdentity: {
    id: 'cases.disclosure.includeReporterIdentity',
    defaultMessage: 'Include reporter identity',
  },
  omitReporterIdentity: {
    id: 'cases.disclosure.omitReporterIdentity',
    defaultMessage: 'Omit reporter identity',
  },
  location: {
    id: 'cases.disclosure.location',
    defaultMessage: 'Location disclosure',
  },
  exactLocation: {
    id: 'cases.disclosure.location.exact',
    defaultMessage: 'Exact location',
  },
  areaOnly: {
    id: 'cases.disclosure.location.area',
    defaultMessage: 'Area only',
  },
  omitLocation: {
    id: 'cases.disclosure.location.omit',
    defaultMessage: 'Omit location',
  },
  areaHint: {
    id: 'cases.disclosure.location.areaHint',
    defaultMessage:
      'Area only never derives or rounds hidden coordinates. It uses only a separately approved area summary or generalized boundary.',
  },
  people: {
    id: 'cases.disclosure.people',
    defaultMessage: 'People and witness names',
  },
  media: {
    id: 'cases.disclosure.media',
    defaultMessage: 'Media',
  },
  sensitiveFields: {
    id: 'cases.disclosure.sensitiveFields',
    defaultMessage: 'Other sensitive fields',
  },
  includeCandidate: {
    id: 'cases.disclosure.includeCandidate',
    defaultMessage: 'Include {label}',
  },
  save: {
    id: 'cases.disclosure.save',
    defaultMessage: 'Save disclosure for {agency}',
  },
  savedRevision: {
    id: 'cases.disclosure.savedRevision',
    defaultMessage: 'Saved disclosure revision {revision}',
  },
  loadError: {
    id: 'cases.disclosure.loadError',
    defaultMessage: 'Could not load disclosure settings.',
  },
  saveError: {
    id: 'cases.disclosure.saveError',
    defaultMessage: 'Could not save disclosure settings. Try again.',
  },
});

function decisionsForCandidates(
  candidates: readonly DisclosureCandidate[],
  existing: readonly { id: string; include: boolean }[],
): Array<{ id: string; include: boolean }> {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  return [
    ...existing.filter((decision) => !candidateIds.has(decision.id)),
    ...candidates.map((candidate) => ({
      id: candidate.id,
      include:
        existing.find((decision) => decision.id === candidate.id)?.include ===
        true,
    })),
  ];
}

function decisionMap(
  candidates: readonly DisclosureCandidate[],
  decisions: readonly { id: string; include: boolean }[],
): Map<string, boolean> {
  return new Map(
    candidates.map((candidate) => [
      candidate.id,
      decisions.find((decision) => decision.id === candidate.id)?.include ===
        true,
    ]),
  );
}

export function CaseReportDisclosurePanel({
  projectLocalId,
  caseLocalId,
  agency,
  people = EMPTY_CANDIDATES,
  media = EMPTY_CANDIDATES,
  sensitiveFields = EMPTY_CANDIDATES,
}: CaseReportDisclosurePanelProps) {
  const intl = useIntl();
  const disclosureQuery = useCaseReportDisclosure(
    projectLocalId,
    caseLocalId,
    agency,
  );
  const upsert = useUpsertCaseReportDisclosure();
  const hydrationKey = `${disclosureQuery.data?.revision ?? 'none'}:${people
    .map((candidate) => candidate.id)
    .join(
      ',',
    )}:${media.map((candidate) => candidate.id).join(',')}:${sensitiveFields
    .map((candidate) => candidate.id)
    .join(',')}`;
  const persistedDraft: CaseReportDisclosure = {
    reporterIdentity: disclosureQuery.data?.reporterIdentity ?? 'omit',
    locationMode: disclosureQuery.data?.locationMode ?? 'omit',
    people: decisionsForCandidates(people, disclosureQuery.data?.people ?? []),
    media: decisionsForCandidates(media, disclosureQuery.data?.media ?? []),
    sensitiveFields: decisionsForCandidates(
      sensitiveFields,
      disclosureQuery.data?.sensitiveFields ?? [],
    ),
  };
  const [draftOverride, setDraftOverride] = useState<{
    key: string;
    value: CaseReportDisclosure;
  } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const draft =
    draftOverride?.key === hydrationKey ? draftOverride.value : persistedDraft;

  function updateDraft(
    updater: (current: CaseReportDisclosure) => CaseReportDisclosure,
  ) {
    setDraftOverride((current) => {
      const base =
        current?.key === hydrationKey ? current.value : persistedDraft;
      return { key: hydrationKey, value: updater(base) };
    });
  }

  const peopleMap = decisionMap(people, draft.people);
  const mediaMap = decisionMap(media, draft.media);
  const sensitiveMap = decisionMap(sensitiveFields, draft.sensitiveFields);

  function toggleDecision(
    key: 'people' | 'media' | 'sensitiveFields',
    candidates: readonly DisclosureCandidate[],
    id: string,
    include: boolean,
  ) {
    updateDraft((current) => ({
      ...current,
      [key]: decisionsForCandidates(candidates, [
        ...current[key].filter((decision) => decision.id !== id),
        { id, include },
      ]),
    }));
  }

  function renderDecisionGroup(
    title: string,
    candidates: readonly DisclosureCandidate[],
    values: Map<string, boolean>,
    key: 'people' | 'media' | 'sensitiveFields',
  ) {
    if (candidates.length === 0) return null;
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-text">{title}</legend>
        <div className="space-y-2">
          {candidates.map((candidate) => (
            <label
              key={candidate.id}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-button bg-surface-container-low px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={values.get(candidate.id) === true}
                onChange={(event) =>
                  toggleDecision(
                    key,
                    candidates,
                    candidate.id,
                    event.currentTarget.checked,
                  )
                }
                aria-label={intl.formatMessage(messages.includeCandidate, {
                  label: candidate.label,
                })}
                className="h-5 w-5 accent-primary"
              />
              <span className="min-w-0 break-words text-text">
                {candidate.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (disclosureQuery.isPending) {
    return (
      <Card className="p-4">
        <Skeleton height={24} width={180} />
        <Skeleton height={96} className="mt-3 rounded-card" />
      </Card>
    );
  }

  if (disclosureQuery.isError) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-error">
          {intl.formatMessage(messages.loadError)}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="space-y-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-text">
            {intl.formatMessage(messages.title, { agency })}
          </h3>
          {(disclosureQuery.data?.revision ?? 0) > 0 ? (
            <span className="text-xs text-text-muted">
              {intl.formatMessage(messages.savedRevision, {
                revision: disclosureQuery.data?.revision ?? 0,
              })}
            </span>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-text">
            {intl.formatMessage(messages.reporterIdentity)}
          </legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-button bg-surface-container-low px-3 py-2 text-sm text-text">
              <input
                type="radio"
                name={`${agency}-reporter-identity`}
                checked={draft.reporterIdentity === 'include'}
                onChange={() =>
                  updateDraft((current) => ({
                    ...current,
                    reporterIdentity: 'include',
                  }))
                }
              />
              {intl.formatMessage(messages.includeReporterIdentity)}
            </label>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-button bg-surface-container-low px-3 py-2 text-sm text-text">
              <input
                type="radio"
                name={`${agency}-reporter-identity`}
                checked={draft.reporterIdentity === 'omit'}
                onChange={() =>
                  updateDraft((current) => ({
                    ...current,
                    reporterIdentity: 'omit',
                  }))
                }
              />
              {intl.formatMessage(messages.omitReporterIdentity)}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-text">
            {intl.formatMessage(messages.location)}
          </legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-button bg-surface-container-low px-3 py-2 text-sm text-text">
              <input
                type="radio"
                name={`${agency}-location`}
                checked={draft.locationMode === 'exact'}
                onChange={() =>
                  updateDraft((current) => ({
                    ...current,
                    locationMode: 'exact',
                  }))
                }
              />
              {intl.formatMessage(messages.exactLocation)}
            </label>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-button bg-surface-container-low px-3 py-2 text-sm text-text">
              <input
                type="radio"
                name={`${agency}-location`}
                checked={draft.locationMode === 'area'}
                onChange={() =>
                  updateDraft((current) => ({
                    ...current,
                    locationMode: 'area',
                  }))
                }
              />
              {intl.formatMessage(messages.areaOnly)}
            </label>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-button bg-surface-container-low px-3 py-2 text-sm text-text">
              <input
                type="radio"
                name={`${agency}-location`}
                checked={draft.locationMode === 'omit'}
                onChange={() =>
                  updateDraft((current) => ({
                    ...current,
                    locationMode: 'omit',
                  }))
                }
              />
              {intl.formatMessage(messages.omitLocation)}
            </label>
          </div>
          {draft.locationMode === 'area' ? (
            <p className="text-xs text-text-muted">
              {intl.formatMessage(messages.areaHint)}
            </p>
          ) : null}
        </fieldset>

        {renderDecisionGroup(
          intl.formatMessage(messages.people),
          people,
          peopleMap,
          'people',
        )}
        {renderDecisionGroup(
          intl.formatMessage(messages.media),
          media,
          mediaMap,
          'media',
        )}
        {renderDecisionGroup(
          intl.formatMessage(messages.sensitiveFields),
          sensitiveFields,
          sensitiveMap,
          'sensitiveFields',
        )}

        {saveError ? (
          <p role="alert" className="text-sm text-error">
            {intl.formatMessage(messages.saveError)}
          </p>
        ) : null}
        <Button
          variant="primary"
          loading={upsert.isPending}
          disabled={upsert.isPending}
          onClick={() => {
            setSaveError(false);
            upsert.mutate(
              {
                projectLocalId,
                caseLocalId,
                agency,
                disclosure: draft,
              },
              {
                onError: () => setSaveError(true),
              },
            );
          }}
          aria-label={intl.formatMessage(messages.save, { agency })}
        >
          {intl.formatMessage(messages.save, { agency })}
        </Button>
      </div>
    </Card>
  );
}
