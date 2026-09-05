import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCaseEvidenceCounts } from '@/hooks/useCaseEvidenceCounts';
import { useCases } from '@/hooks/useCases';
import { useProjects } from '@/hooks/useProjects';
import { useStoragePersist } from '@/hooks/useStoragePersist';
import type { Case } from '@/lib/data-layer';
import type { CaseStatus } from '@/lib/db';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: { id: 'cases.title', defaultMessage: 'Cases' },
  storageRiskWarning: {
    id: 'cases.storageRiskWarning',
    defaultMessage:
      'Local storage is not protected from eviction. Your Cases may be removed when disk space is low.',
  },
  storageQuotaRiskWarning: {
    id: 'cases.storageQuotaRiskWarning',
    defaultMessage:
      'Your device is running low on storage. Cases may be lost if space is not freed.',
  },
  noProject: {
    id: 'cases.noProject',
    defaultMessage: 'Select a project from Home to view cases',
  },
  noProjectLink: {
    id: 'cases.noProjectLink',
    defaultMessage: 'Go to Home',
  },
  untitledProject: {
    id: 'cases.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  newCase: { id: 'cases.newCase', defaultMessage: 'New Case' },
  loading: { id: 'cases.loading', defaultMessage: 'Loading...' },
  noCases: { id: 'cases.noCases', defaultMessage: 'No cases yet' },
  casesError: {
    id: 'cases.casesError',
    defaultMessage: 'Failed to load cases. Please try again.',
  },
  evidenceCount: {
    id: 'cases.evidenceCount',
    defaultMessage:
      '{count, plural, one {# evidence item} other {# evidence items}}',
  },
  revision: { id: 'cases.revision', defaultMessage: 'Revision {revision}' },
  caseTypeInvasionOccupation: {
    id: 'cases.type.invasion_occupation',
    defaultMessage: 'Invasion / illegal occupation',
  },
  caseTypeTerritorialEncroachment: {
    id: 'cases.type.territorial_encroachment',
    defaultMessage: 'Territorial encroachment or infrastructure impact',
  },
  caseTypeDeforestationLogging: {
    id: 'cases.type.deforestation_logging',
    defaultMessage: 'Deforestation / illegal logging',
  },
  caseTypeIllegalMining: {
    id: 'cases.type.illegal_mining',
    defaultMessage: 'Illegal mining',
  },
  caseTypeFire: { id: 'cases.type.fire', defaultMessage: 'Fire' },
  caseTypeWildlifeExploitation: {
    id: 'cases.type.wildlife_exploitation',
    defaultMessage: 'Illegal hunting / fishing / wildlife exploitation',
  },
  caseTypePollutionContamination: {
    id: 'cases.type.pollution_contamination',
    defaultMessage: 'Pollution / contamination',
  },
  caseTypeThreatsViolence: {
    id: 'cases.type.threats_violence',
    defaultMessage: 'Threats / intimidation / violence',
  },
  caseTypeRightsViolation: {
    id: 'cases.type.rights_violation',
    defaultMessage: 'Other violation of Indigenous or territorial rights',
  },
  caseTypeOther: { id: 'cases.type.other', defaultMessage: 'Other' },
  updatedAtLabel: {
    id: 'cases.updatedAt',
    defaultMessage: 'Updated',
  },
});

const STATUS_LABEL_DESCRIPTORS: Record<
  CaseStatus,
  { id: string; defaultMessage: string }
> = {
  draft: { id: 'cases.status.draft', defaultMessage: 'Draft' },
  active: { id: 'cases.status.active', defaultMessage: 'Active' },
  closed: { id: 'cases.status.closed', defaultMessage: 'Closed' },
};

function getCaseTypeLabelDescriptor(caseType: Case['caseType']) {
  switch (caseType) {
    case 'invasion_occupation':
      return messages.caseTypeInvasionOccupation;
    case 'territorial_encroachment':
      return messages.caseTypeTerritorialEncroachment;
    case 'deforestation_logging':
      return messages.caseTypeDeforestationLogging;
    case 'illegal_mining':
      return messages.caseTypeIllegalMining;
    case 'fire':
      return messages.caseTypeFire;
    case 'wildlife_exploitation':
      return messages.caseTypeWildlifeExploitation;
    case 'pollution_contamination':
      return messages.caseTypePollutionContamination;
    case 'threats_violence':
      return messages.caseTypeThreatsViolence;
    case 'rights_violation':
      return messages.caseTypeRightsViolation;
    case 'other':
      return messages.caseTypeOther;
  }
}

export function CasesScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const casesQuery = useCases(selectedProjectId);
  const evidenceCountsQuery = useCaseEvidenceCounts(selectedProjectId);
  const storagePersist = useStoragePersist();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);
  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);

  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.title),
    }),
    [intl, selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  // No project selected
  if (!selectedProjectId || !selectedProject) {
    if (projectsQuery.isPending) {
      return (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton height={40} width={200} />
          <Skeleton height={200} className="rounded-card" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted text-sm">
          {intl.formatMessage(messages.noProject)}
        </p>
        <Link
          to="/"
          className="text-primary text-sm font-medium hover:underline"
        >
          {intl.formatMessage(messages.noProjectLink)}
        </Link>
      </div>
    );
  }

  const cases = casesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Title + New Case button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-text">
          {intl.formatMessage(messages.title)}
        </h1>
        <Link
          to="/cases/new"
          className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-3 py-2 text-center text-xs font-medium text-white no-underline transition-colors hover:bg-primary-dark"
        >
          {intl.formatMessage(messages.newCase)}
        </Link>
      </div>

      {/* Storage eviction-risk warning (non-blocking) */}
      {storagePersist.isEvictionRisk && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card bg-surface-card px-4 py-3 text-sm text-text"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 flex-shrink-0 text-warning"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1">
            {storagePersist.state === 'quota-risk'
              ? intl.formatMessage(messages.storageQuotaRiskWarning)
              : intl.formatMessage(messages.storageRiskWarning)}
          </span>
        </div>
      )}

      {/* Cases content */}
      {(() => {
        if (casesQuery.isError) {
          return (
            <div role="alert" className="flex items-center justify-center p-8">
              <span className="text-error text-sm">
                {intl.formatMessage(messages.casesError)}
              </span>
            </div>
          );
        }
        if (casesQuery.isPending) {
          return (
            <div role="status" className="flex flex-col gap-4 p-6">
              <span className="sr-only">
                {intl.formatMessage(messages.loading)}
              </span>
              <Skeleton height={100} className="rounded-card" />
              <Skeleton height={100} className="rounded-card" />
            </div>
          );
        }
        if (cases.length === 0) {
          return (
            <div className="flex items-center justify-center p-8">
              <span className="text-text-muted text-sm">
                {intl.formatMessage(messages.noCases)}
              </span>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((caze) => (
              <Link
                key={caze.localId}
                to="/cases/$caseId"
                params={{ caseId: caze.localId }}
                className="no-underline"
              >
                <Card className="p-4 hover:shadow-elevated transition-shadow cursor-pointer h-full">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-text break-words wrap-anywhere">
                      {caze.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-muted">
                        {intl.formatMessage(
                          getCaseTypeLabelDescriptor(caze.caseType),
                        )}
                      </span>
                      <span className="text-xs text-text-muted">•</span>
                      <span className="text-xs text-text-muted">
                        {intl.formatMessage(
                          STATUS_LABEL_DESCRIPTORS[caze.status] ??
                            STATUS_LABEL_DESCRIPTORS.draft,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-text-muted">
                      <span>
                        {intl.formatMessage(messages.updatedAtLabel)}:{' '}
                        {intl.formatDate(new Date(caze.updatedAt), {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span data-testid="evidence-count">
                        {intl.formatMessage(messages.evidenceCount, {
                          count: evidenceCountsQuery.data?.[caze.localId] ?? 0,
                        })}
                      </span>
                      <span>
                        {intl.formatMessage(messages.revision, {
                          revision: caze.revision,
                        })}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
