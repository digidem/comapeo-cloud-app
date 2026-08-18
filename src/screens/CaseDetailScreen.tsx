import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Link, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useCase } from '@/hooks/useCase';
import { useCaseActivity } from '@/hooks/useCaseActivity';
import { useCaseReportStates } from '@/hooks/useCaseReportStates';
import { useProjects } from '@/hooks/useProjects';
import { useUpdateCase } from '@/hooks/useUpdateCase';
import type { Case, CaseActivity, CaseReportState } from '@/lib/data-layer';
import type { CaseActivityEvent, CaseAgency } from '@/lib/db';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  casesLabel: { id: 'cases.title', defaultMessage: 'Cases' },
  title: { id: 'cases.detail.title', defaultMessage: 'Case' },
  untitledProject: {
    id: 'cases.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  notFound: {
    id: 'cases.detail.notFound',
    defaultMessage: 'Case not found',
  },
  errorLoading: {
    id: 'cases.detail.errorLoading',
    defaultMessage: 'Failed to load case',
  },
  overview: { id: 'cases.detail.overview', defaultMessage: 'Overview' },
  activity: { id: 'cases.detail.activity', defaultMessage: 'Activity' },
  reportState: {
    id: 'cases.detail.reportState',
    defaultMessage: 'Report State',
  },
  created: { id: 'cases.detail.created', defaultMessage: 'Created' },
  updatedAt: {
    id: 'cases.detail.updatedAt',
    defaultMessage: 'Last updated',
  },
  revision: {
    id: 'cases.detail.revision',
    defaultMessage: 'Revision {revision}',
  },
  incidentDate: {
    id: 'cases.detail.incidentDate',
    defaultMessage: 'Incident Date',
  },
  noIncidentDate: {
    id: 'cases.detail.noIncidentDate',
    defaultMessage: 'Not specified',
  },
  locationTerritory: {
    id: 'cases.detail.locationTerritory',
    defaultMessage: 'Location & Territory',
  },
  noLocation: {
    id: 'cases.detail.noLocation',
    defaultMessage: 'No location specified',
  },
  peopleCommunity: {
    id: 'cases.detail.peopleCommunity',
    defaultMessage: 'People & Community',
  },
  noPeople: {
    id: 'cases.detail.noPeople',
    defaultMessage: 'No people/community info specified',
  },
  urgency: { id: 'cases.detail.urgency', defaultMessage: 'Urgency' },
  noUrgency: {
    id: 'cases.detail.noUrgency',
    defaultMessage: 'No urgency info specified',
  },
  changeStatus: {
    id: 'cases.detail.changeStatus',
    defaultMessage: 'Change Status',
  },
  currentStatus: {
    id: 'cases.detail.currentStatus',
    defaultMessage: 'Current:',
  },
  lifecycle: {
    id: 'cases.detail.lifecycle',
    defaultMessage: 'Lifecycle',
  },
  loading: { id: 'cases.detail.loading', defaultMessage: 'Loading...' },
  noActivity: {
    id: 'cases.detail.noActivity',
    defaultMessage: 'No activity yet',
  },
  noReportState: {
    id: 'cases.detail.noReportState',
    defaultMessage: 'No report state recorded yet',
  },
  // Case type labels
  typeInvasionOccupation: {
    id: 'cases.type.invasion_occupation',
    defaultMessage: 'Invasion / illegal occupation',
  },
  typeTerritorialEncroachment: {
    id: 'cases.type.territorial_encroachment',
    defaultMessage: 'Territorial encroachment or infrastructure impact',
  },
  typeDeforestationLogging: {
    id: 'cases.type.deforestation_logging',
    defaultMessage: 'Deforestation / illegal logging',
  },
  typeIllegalMining: {
    id: 'cases.type.illegal_mining',
    defaultMessage: 'Illegal mining',
  },
  typeFire: { id: 'cases.type.fire', defaultMessage: 'Fire' },
  typeWildlifeExploitation: {
    id: 'cases.type.wildlife_exploitation',
    defaultMessage: 'Illegal hunting / fishing / wildlife exploitation',
  },
  typePollutionContamination: {
    id: 'cases.type.pollution_contamination',
    defaultMessage: 'Pollution / contamination',
  },
  typeThreatsViolence: {
    id: 'cases.type.threats_violence',
    defaultMessage: 'Threats / intimidation / violence',
  },
  typeRightsViolation: {
    id: 'cases.type.rights_violation',
    defaultMessage: 'Other violation of Indigenous or territorial rights',
  },
  typeOther: { id: 'cases.type.other', defaultMessage: 'Other' },
  // Case status labels
  statusDraft: {
    id: 'cases.status.draft',
    defaultMessage: 'Draft',
  },
  statusActive: {
    id: 'cases.status.active',
    defaultMessage: 'Active',
  },
  statusClosed: {
    id: 'cases.status.closed',
    defaultMessage: 'Closed',
  },
  // Agency labels
  agencyFUNAI: {
    id: 'cases.agency.FUNAI',
    defaultMessage: 'FUNAI',
  },
  agencyIBAMA: {
    id: 'cases.agency.IBAMA',
    defaultMessage: 'IBAMA',
  },
  agencyMPF: {
    id: 'cases.agency.MPF',
    defaultMessage: 'MPF',
  },
  agencyPF: {
    id: 'cases.agency.PF',
    defaultMessage: 'PF',
  },
  // Report state labels
  reportStateComplete: {
    id: 'cases.reportState.complete',
    defaultMessage: 'Complete',
  },
  reportStateError: {
    id: 'cases.reportState.error',
    defaultMessage: 'Error',
  },
  reportStateIncomplete: {
    id: 'cases.reportState.incomplete',
    defaultMessage: 'Incomplete',
  },
  reportStatePending: {
    id: 'cases.reportState.pending',
    defaultMessage: 'Pending',
  },
  // Activity event labels
  activityCreated: {
    id: 'cases.activity.created',
    defaultMessage: 'Created',
  },
  activityStatusChanged: {
    id: 'cases.activity.status_changed',
    defaultMessage: 'Status Changed',
  },
  activityReopened: {
    id: 'cases.activity.reopened',
    defaultMessage: 'Reopened',
  },
  activityReportStateChanged: {
    id: 'cases.activity.report_state_changed',
    defaultMessage: 'Report State Changed',
  },
  activityDeleted: {
    id: 'cases.activity.deleted',
    defaultMessage: 'Deleted',
  },
  activityUnknown: {
    id: 'cases.activity.unknown',
    defaultMessage: 'Event',
  },
});

function getCaseTypeLabelDescriptor(caseType: Case['caseType']) {
  switch (caseType) {
    case 'invasion_occupation':
      return messages.typeInvasionOccupation;
    case 'territorial_encroachment':
      return messages.typeTerritorialEncroachment;
    case 'deforestation_logging':
      return messages.typeDeforestationLogging;
    case 'illegal_mining':
      return messages.typeIllegalMining;
    case 'fire':
      return messages.typeFire;
    case 'wildlife_exploitation':
      return messages.typeWildlifeExploitation;
    case 'pollution_contamination':
      return messages.typePollutionContamination;
    case 'threats_violence':
      return messages.typeThreatsViolence;
    case 'rights_violation':
      return messages.typeRightsViolation;
    case 'other':
      return messages.typeOther;
  }
}

const STATUS_LABEL_DESCRIPTORS: Record<
  Case['status'],
  { id: string; defaultMessage: string }
> = {
  draft: { id: 'cases.status.draft', defaultMessage: 'Draft' },
  active: { id: 'cases.status.active', defaultMessage: 'Active' },
  closed: { id: 'cases.status.closed', defaultMessage: 'Closed' },
};

const REPORT_STATUS_VARIANT: Record<CaseReportStatus, 'info' | 'high' | 'low'> =
  {
    complete: 'info',
    error: 'high',
    incomplete: 'low',
  };

const REPORT_STATUS_LABEL_DESCRIPTORS: Record<
  CaseReportStatus,
  { id: string; defaultMessage: string }
> = {
  complete: { id: 'cases.reportState.complete', defaultMessage: 'Complete' },
  error: { id: 'cases.reportState.error', defaultMessage: 'Error' },
  incomplete: {
    id: 'cases.reportState.incomplete',
    defaultMessage: 'Incomplete',
  },
};

const AGENCY_LABEL_DESCRIPTORS: Record<
  CaseAgency,
  { id: string; defaultMessage: string }
> = {
  FUNAI: { id: 'cases.agency.FUNAI', defaultMessage: 'FUNAI' },
  IBAMA: { id: 'cases.agency.IBAMA', defaultMessage: 'IBAMA' },
  MPF: { id: 'cases.agency.MPF', defaultMessage: 'MPF' },
  PF: { id: 'cases.agency.PF', defaultMessage: 'PF' },
};

const ACTIVITY_EVENT_LABEL_DESCRIPTORS: Record<
  CaseActivityEvent,
  { id: string; defaultMessage: string }
> = {
  created: { id: 'cases.activity.created', defaultMessage: 'Created' },
  ['status_changed']: {
    id: 'cases.activity.status_changed',
    defaultMessage: 'Status Changed',
  },
  reopened: {
    id: 'cases.activity.reopened',
    defaultMessage: 'Reopened',
  },
  ['report_state_changed']: {
    id: 'cases.activity.report_state_changed',
    defaultMessage: 'Report State Changed',
  },
  deleted: {
    id: 'cases.activity.deleted',
    defaultMessage: 'Deleted',
  },
};

const REPORT_STATUS_PENDING_DESCRIPTOR = {
  id: 'cases.reportState.pending',
  defaultMessage: 'Pending',
};

type CaseReportStatus = 'complete' | 'error' | 'incomplete';

const AGENCIES: CaseAgency[] = ['FUNAI', 'IBAMA', 'MPF', 'PF'];

/** Cycle a Case status forward: draft → active → closed → draft (reopen). */
function nextCaseStatus(current: Case['status']): Case['status'] {
  if (current === 'draft') return 'active';
  if (current === 'active') return 'closed';
  return 'draft';
}

interface OverviewTabProps {
  caze: Case;
  typeLabel: string;
  statusLabel: string;
  isUpdating: boolean;
  onChangeStatus: () => void;
}

function OverviewTab({
  caze,
  typeLabel,
  statusLabel,
  isUpdating,
  onChangeStatus,
}: OverviewTabProps) {
  const intl = useIntl();

  return (
    <Tabs.Content value="overview">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-text">{caze.title}</h1>
          <Badge variant="info">{typeLabel}</Badge>
          <Badge variant="neutral">{statusLabel}</Badge>
        </div>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.created)}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-muted">
                {intl.formatMessage(messages.created)}
              </span>
              <span className="block text-sm text-text">
                {intl.formatDate(new Date(caze.createdAt), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-muted">
                {intl.formatMessage(messages.updatedAt)}
              </span>
              <span className="block text-sm text-text">
                {intl.formatDate(new Date(caze.updatedAt), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-muted">
                {intl.formatMessage(messages.revision, {
                  revision: caze.revision,
                })}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.incidentDate)}
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">
              {intl.formatMessage(messages.noIncidentDate)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.locationTerritory)}
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">
              {intl.formatMessage(messages.noLocation)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.peopleCommunity)}
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">
              {intl.formatMessage(messages.noPeople)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.urgency)}
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-text-muted">
              {intl.formatMessage(messages.noUrgency)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-text mb-3">
            {intl.formatMessage(messages.lifecycle)}
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isUpdating}
              onClick={onChangeStatus}
              className="inline-flex min-h-[44px] items-center rounded-button bg-surface-card px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {intl.formatMessage(messages.changeStatus)}
            </button>
            <span className="text-xs text-text-muted">
              {intl.formatMessage(messages.currentStatus)} {statusLabel}
            </span>
          </div>
        </Card>
      </div>
    </Tabs.Content>
  );
}

interface ActivityTabProps {
  activity: CaseActivity[] | undefined;
  isPending: boolean;
}

function ActivityTab({ activity, isPending }: ActivityTabProps) {
  const intl = useIntl();

  return (
    <Tabs.Content value="activity">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">
          {intl.formatMessage(messages.activity)}
        </h2>
        {isPending ? (
          <Skeleton height={100} className="rounded-card" />
        ) : (
          <div className="space-y-2">
            {activity && activity.length > 0 ? (
              activity.map((item) => (
                <div
                  key={item.localId}
                  className="flex items-center justify-between rounded-card bg-surface-card px-4 py-2 text-sm"
                >
                  <span className="text-text-muted capitalize">
                    {intl.formatMessage(
                      ACTIVITY_EVENT_LABEL_DESCRIPTORS[item.event] ??
                        ACTIVITY_EVENT_LABEL_DESCRIPTORS.created,
                    )}
                  </span>
                  {item.status && (
                    <span className="text-xs text-text-muted">
                      {intl.formatMessage(
                        STATUS_LABEL_DESCRIPTORS[item.status] ??
                          STATUS_LABEL_DESCRIPTORS.draft,
                      )}
                    </span>
                  )}
                  <span className="text-xs text-text-muted">
                    {intl.formatDate(new Date(item.createdAt), {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-text-muted text-sm">
                {intl.formatMessage(messages.noActivity)}
              </span>
            )}
          </div>
        )}
      </div>
    </Tabs.Content>
  );
}

interface ReportStateTabProps {
  reportStates: CaseReportState[] | undefined;
}

function ReportStateTab({ reportStates }: ReportStateTabProps) {
  const intl = useIntl();

  return (
    <Tabs.Content value="report-state">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">
          {intl.formatMessage(messages.reportState)}
        </h2>
        {reportStates && reportStates.length > 0 ? (
          <div className="flex flex-col gap-3">
            {AGENCIES.map((agency) => {
              const state =
                reportStates.find(
                  (reportState) => reportState.agency === agency,
                ) ?? null;
              const reportBadgeVariant =
                state && REPORT_STATUS_VARIANT[state.status];
              const reportBadgeLabelDescriptor =
                state &&
                (REPORT_STATUS_LABEL_DESCRIPTORS[state.status] ??
                  REPORT_STATUS_LABEL_DESCRIPTORS.incomplete);

              return (
                <Card key={agency} className="p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text">
                      {intl.formatMessage(AGENCY_LABEL_DESCRIPTORS[agency])}
                    </h4>
                    {state ? (
                      <Badge variant={reportBadgeVariant ?? 'low'}>
                        {intl.formatMessage(
                          reportBadgeLabelDescriptor ??
                            REPORT_STATUS_LABEL_DESCRIPTORS.incomplete,
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        {intl.formatMessage(REPORT_STATUS_PENDING_DESCRIPTOR)}
                      </Badge>
                    )}
                  </div>
                  {state && (
                    <div className="mt-2 text-xs text-text-muted">
                      {intl.formatMessage(messages.revision, {
                        revision: state.revision,
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <span className="text-text-muted text-sm">
            {intl.formatMessage(messages.noReportState)}
          </span>
        )}
      </div>
    </Tabs.Content>
  );
}

export function CaseDetailScreen() {
  const intl = useIntl();
  const { caseId } = useParams({ strict: false }) as {
    caseId: string;
  };
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const caseQuery = useCase(selectedProjectId, caseId);
  const activityQuery = useCaseActivity(selectedProjectId, caseId);
  const reportStatesQuery = useCaseReportStates(selectedProjectId, caseId);
  const updateCase = useUpdateCase();
  const projectsQuery = useProjects();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);

  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.title),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  // Loading state
  if (caseQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={200} />
        <Skeleton height={40} width={300} />
        <Skeleton height={200} className="rounded-card" />
      </div>
    );
  }

  // Error state
  if (caseQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-error font-semibold">
          {intl.formatMessage(messages.errorLoading)}
        </p>
      </div>
    );
  }

  const caze = caseQuery.data;

  // Missing / invalid / cross-project case resolves to null
  if (!caze) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted">
          {intl.formatMessage(messages.notFound)}
        </p>
        <Link
          to="/cases"
          className="text-primary text-sm font-medium hover:underline"
        >
          {intl.formatMessage(messages.casesLabel)}
        </Link>
      </div>
    );
  }

  const typeLabel = intl.formatMessage(
    getCaseTypeLabelDescriptor(caze.caseType),
  );
  const statusLabel = intl.formatMessage(
    STATUS_LABEL_DESCRIPTORS[caze.status] ?? STATUS_LABEL_DESCRIPTORS.draft,
  );

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      {/* Back navigation */}
      <div className="flex items-center gap-3">
        <Link
          to="/cases"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition-colors min-h-[44px]"
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
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {intl.formatMessage(messages.casesLabel)}
        </Link>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">
            {intl.formatMessage(messages.overview)}
          </Tabs.Trigger>
          <Tabs.Trigger value="activity">
            {intl.formatMessage(messages.activity)}
          </Tabs.Trigger>
          <Tabs.Trigger value="report-state">
            {intl.formatMessage(messages.reportState)}
          </Tabs.Trigger>
        </Tabs.List>

        <OverviewTab
          caze={caze}
          typeLabel={typeLabel}
          statusLabel={statusLabel}
          isUpdating={updateCase.isPending}
          onChangeStatus={() => {
            if (!selectedProjectId || !caseId) return;
            updateCase.mutate({
              projectLocalId: selectedProjectId,
              localId: caseId,
              updates: { status: nextCaseStatus(caze.status) },
            });
          }}
        />

        <ActivityTab
          activity={activityQuery.data}
          isPending={activityQuery.isPending}
        />

        <ReportStateTab reportStates={reportStatesQuery.data} />
      </Tabs>
    </div>
  );
}
