import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { CaseEvidenceMap } from '@/components/shared/CaseEvidenceMap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddCaseEvidence } from '@/hooks/useAddCaseEvidence';
import { useAlerts } from '@/hooks/useAlerts';
import { useAttachmentsForProject } from '@/hooks/useAttachmentsForProject';
import { useCaseEvidence } from '@/hooks/useCaseEvidence';
import { useCaseEvidenceAttachments } from '@/hooks/useCaseEvidenceAttachments';
import { useObservations } from '@/hooks/useObservations';
import { useRemoveCaseEvidence } from '@/hooks/useRemoveCaseEvidence';
import { useSetCaseEvidenceAttachmentSelected } from '@/hooks/useSetCaseEvidenceAttachmentSelected';
import { useTracks } from '@/hooks/useTracks';
import type { Alert, Attachment, Observation, Track } from '@/lib/data-layer';
import type { CaseEvidenceSourceType } from '@/lib/db';
import type { ResolvedCaseEvidence } from '@/lib/local-repositories';

const messages = defineMessages({
  browseTitle: {
    id: 'cases.evidence.browseTitle',
    defaultMessage: 'Browse project evidence',
  },
  selectedTitle: {
    id: 'cases.evidence.selectedTitle',
    defaultMessage: 'Selected evidence',
  },
  search: { id: 'cases.evidence.search', defaultMessage: 'Search evidence' },
  all: { id: 'cases.evidence.filter.all', defaultMessage: 'All' },
  observations: {
    id: 'cases.evidence.filter.observations',
    defaultMessage: 'Observations',
  },
  alerts: { id: 'cases.evidence.filter.alerts', defaultMessage: 'Alerts' },
  tracks: { id: 'cases.evidence.filter.tracks', defaultMessage: 'Tracks' },
  add: { id: 'cases.evidence.add', defaultMessage: 'Add' },
  remove: { id: 'cases.evidence.remove', defaultMessage: 'Remove' },
  addSource: {
    id: 'cases.evidence.addSource',
    defaultMessage: 'Add {type} {name}',
  },
  removeSource: {
    id: 'cases.evidence.removeSource',
    defaultMessage: 'Remove {type} {name}',
  },
  observation: {
    id: 'cases.evidence.observation',
    defaultMessage: 'Observation',
  },
  alert: { id: 'cases.evidence.alert', defaultMessage: 'Alert' },
  track: { id: 'cases.evidence.track', defaultMessage: 'Track' },
  list: { id: 'cases.evidence.view.list', defaultMessage: 'List' },
  timeline: { id: 'cases.evidence.view.timeline', defaultMessage: 'Timeline' },
  map: { id: 'cases.evidence.view.map', defaultMessage: 'Map' },
  noProjectEvidence: {
    id: 'cases.evidence.noProjectEvidence',
    defaultMessage: 'No project evidence matches your search.',
  },
  noSelected: {
    id: 'cases.evidence.noSelected',
    defaultMessage: 'No evidence has been added to this case yet.',
  },
  changed: {
    id: 'cases.evidence.state.changed',
    defaultMessage: 'Changed since added',
  },
  deleted: {
    id: 'cases.evidence.state.deleted',
    defaultMessage: 'Deleted at source',
  },
  unavailable: {
    id: 'cases.evidence.state.unavailable',
    defaultMessage: 'Source unavailable',
  },
  unsynced: {
    id: 'cases.evidence.state.unsynced',
    defaultMessage: 'Not project-synced',
  },
  attachments: {
    id: 'cases.evidence.attachments',
    defaultMessage: 'Photo & audio evidence',
  },
  includeAttachment: {
    id: 'cases.evidence.includeAttachment',
    defaultMessage: 'Include {name}',
  },
  remoteOnly: {
    id: 'cases.evidence.media.remoteOnly',
    defaultMessage: 'Not available locally',
  },
  deletedMedia: {
    id: 'cases.evidence.media.deleted',
    defaultMessage: 'Media deleted at source',
  },
  unavailableMedia: {
    id: 'cases.evidence.media.unavailable',
    defaultMessage: 'Media unavailable',
  },
  mediaChanged: {
    id: 'cases.evidence.media.changed',
    defaultMessage: 'Media changed since selected',
  },
  loading: { id: 'cases.evidence.loading', defaultMessage: 'Loading evidence' },
  loadError: {
    id: 'cases.evidence.loadError',
    defaultMessage: 'Could not load Case evidence.',
  },
});

type BrowserFilter = 'all' | CaseEvidenceSourceType;
type SelectedView = 'list' | 'timeline' | 'map';

type ProjectEvidenceItem =
  | { sourceType: 'observation'; source: Observation; name: string }
  | { sourceType: 'alert'; source: Alert; name: string }
  | { sourceType: 'track'; source: Track; name: string };

function observationName(observation: Observation, fallback: string): string {
  const category = observation.tags?.category?.trim();
  if (category) return category;
  const notes = observation.tags?.notes?.trim();
  if (notes) return notes;
  return fallback;
}

function alertName(alert: Alert, fallback: string): string {
  const value = alert.metadata?.alert_type;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function trackName(track: Track, fallback: string): string {
  const value = track.tags?.name;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getItemCreatedAt(item: ProjectEvidenceItem): string {
  if (item.sourceType === 'alert') {
    return item.source.detectionDateStart ?? item.source.createdAt;
  }
  if (item.sourceType === 'track') {
    return (
      item.source.locations.find((location) => location.timestamp)?.timestamp ??
      item.source.createdAt
    );
  }
  return item.source.createdAt;
}

function sourceTypeLabel(
  sourceType: CaseEvidenceSourceType,
  labels: Record<CaseEvidenceSourceType, string>,
): string {
  return labels[sourceType];
}

interface CaseEvidenceWorkspaceProps {
  projectLocalId: string;
  caseLocalId: string;
}

export function CaseEvidenceWorkspace({
  projectLocalId,
  caseLocalId,
}: CaseEvidenceWorkspaceProps) {
  const intl = useIntl();
  const observationsQuery = useObservations(projectLocalId);
  const alertsQuery = useAlerts(projectLocalId);
  const tracksQuery = useTracks(projectLocalId);
  const attachmentsQuery = useAttachmentsForProject(projectLocalId);
  const evidenceQuery = useCaseEvidence(projectLocalId, caseLocalId);
  const selectedAttachmentsQuery = useCaseEvidenceAttachments(
    projectLocalId,
    caseLocalId,
  );
  const addEvidence = useAddCaseEvidence();
  const removeEvidence = useRemoveCaseEvidence();
  const setAttachmentSelected = useSetCaseEvidenceAttachmentSelected();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BrowserFilter>('all');
  const [selectedView, setSelectedView] = useState<SelectedView>('list');

  const typeLabels = useMemo<Record<CaseEvidenceSourceType, string>>(
    () => ({
      observation: intl.formatMessage(messages.observation).toLowerCase(),
      alert: intl.formatMessage(messages.alert).toLowerCase(),
      track: intl.formatMessage(messages.track).toLowerCase(),
    }),
    [intl],
  );

  const allProjectItems = useMemo<ProjectEvidenceItem[]>(() => {
    const items: ProjectEvidenceItem[] = [];
    const observationFallback = intl.formatMessage(messages.observation);
    const alertFallback = intl.formatMessage(messages.alert);
    const trackFallback = intl.formatMessage(messages.track);
    for (const source of observationsQuery.data ?? []) {
      items.push({
        sourceType: 'observation',
        source,
        name: observationName(source, observationFallback),
      });
    }
    for (const source of alertsQuery.data ?? []) {
      items.push({
        sourceType: 'alert',
        source,
        name: alertName(source, alertFallback),
      });
    }
    for (const source of tracksQuery.data ?? []) {
      items.push({
        sourceType: 'track',
        source,
        name: trackName(source, trackFallback),
      });
    }

    const seen = new Set(
      items.map((item) => `${item.sourceType}:${item.source.localId}`),
    );
    for (const reference of evidenceQuery.data ?? []) {
      const source = reference.source;
      const key = `${reference.sourceType}:${reference.sourceLocalId}`;
      if (!source || seen.has(key)) continue;
      seen.add(key);
      if (reference.sourceType === 'observation') {
        const observation = source as Observation;
        items.push({
          sourceType: 'observation',
          source: observation,
          name: observationName(observation, observationFallback),
        });
      } else if (reference.sourceType === 'alert') {
        const alert = source as Alert;
        items.push({
          sourceType: 'alert',
          source: alert,
          name: alertName(alert, alertFallback),
        });
      } else {
        const track = source as Track;
        items.push({
          sourceType: 'track',
          source: track,
          name: trackName(track, trackFallback),
        });
      }
    }
    return items;
  }, [
    alertsQuery.data,
    evidenceQuery.data,
    intl,
    observationsQuery.data,
    tracksQuery.data,
  ]);
  const projectItems = useMemo(
    () => allProjectItems.filter((item) => !item.source.deleted),
    [allProjectItems],
  );

  const itemByKey = useMemo(
    () =>
      new Map(
        allProjectItems.map((item) => [
          `${item.sourceType}:${item.source.localId}`,
          item,
        ]),
      ),
    [allProjectItems],
  );
  const evidenceBySourceKey = useMemo(
    () =>
      new Map(
        (evidenceQuery.data ?? []).map((evidence) => [
          `${evidence.sourceType}:${evidence.sourceLocalId}`,
          evidence,
        ]),
      ),
    [evidenceQuery.data],
  );
  const selectedAttachmentById = useMemo(
    () =>
      new Map(
        (selectedAttachmentsQuery.data ?? []).map((attachment) => [
          attachment.attachmentLocalId,
          attachment,
        ]),
      ),
    [selectedAttachmentsQuery.data],
  );
  const attachmentsByObservationId = useMemo(() => {
    const map = new Map<string, Attachment[]>();
    for (const attachment of attachmentsQuery.data ?? []) {
      if (
        attachment.deleted ||
        (attachment.mediaType !== 'photo' && attachment.mediaType !== 'audio')
      ) {
        continue;
      }
      const current = map.get(attachment.observationLocalId) ?? [];
      current.push(attachment);
      map.set(attachment.observationLocalId, current);
    }
    return map;
  }, [attachmentsQuery.data]);

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return projectItems.filter((item) => {
      if (filter !== 'all' && item.sourceType !== filter) return false;
      if (!normalized) return true;
      return (
        item.name.toLocaleLowerCase().includes(normalized) ||
        item.source.localId.toLocaleLowerCase().includes(normalized)
      );
    });
  }, [filter, projectItems, search]);

  const selectedEvidence = useMemo(() => {
    const refs = [...(evidenceQuery.data ?? [])];
    refs.sort((a, b) => {
      const itemA = itemByKey.get(`${a.sourceType}:${a.sourceLocalId}`);
      const itemB = itemByKey.get(`${b.sourceType}:${b.sourceLocalId}`);
      const dateA = itemA ? getItemCreatedAt(itemA) : a.addedAt;
      const dateB = itemB ? getItemCreatedAt(itemB) : b.addedAt;
      return dateA.localeCompare(dateB) || a.localId.localeCompare(b.localId);
    });
    return refs;
  }, [evidenceQuery.data, itemByKey]);

  const isLoading =
    observationsQuery.isPending ||
    alertsQuery.isPending ||
    tracksQuery.isPending ||
    evidenceQuery.isPending;

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={intl.formatMessage(messages.loading)}
        className="space-y-3"
      >
        <Skeleton height={44} className="rounded-card" />
        <Skeleton height={120} className="rounded-card" />
        <Skeleton height={120} className="rounded-card" />
      </div>
    );
  }
  if (evidenceQuery.isError) {
    return (
      <p role="alert" className="text-sm text-error">
        {intl.formatMessage(messages.loadError)}
      </p>
    );
  }

  function renderWarnings(evidence: ResolvedCaseEvidence) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {evidence.freshness === 'changed' ? (
          <Badge variant="medium">{intl.formatMessage(messages.changed)}</Badge>
        ) : null}
        {evidence.availability === 'deleted' ? (
          <Badge variant="high">{intl.formatMessage(messages.deleted)}</Badge>
        ) : null}
        {evidence.availability === 'unavailable' ? (
          <Badge variant="high">
            {intl.formatMessage(messages.unavailable)}
          </Badge>
        ) : null}
        {evidence.syncState === 'unsynced' ? (
          <Badge variant="low">{intl.formatMessage(messages.unsynced)}</Badge>
        ) : null}
      </div>
    );
  }

  function renderAttachments(evidence: ResolvedCaseEvidence) {
    if (evidence.sourceType !== 'observation') return null;
    const currentAttachments =
      attachmentsByObservationId.get(evidence.sourceLocalId) ?? [];
    const rows = currentAttachments.map((attachment) => ({
      attachmentLocalId: attachment.localId,
      name: attachment.name ?? attachment.localId,
      mediaType: attachment.mediaType,
      downloadStatus: attachment.downloadStatus,
      selectedReference: selectedAttachmentById.get(attachment.localId),
    }));
    const currentIds = new Set(
      currentAttachments.map((attachment) => attachment.localId),
    );
    for (const selectedReference of selectedAttachmentsQuery.data ?? []) {
      if (
        selectedReference.evidenceLocalId !== evidence.localId ||
        currentIds.has(selectedReference.attachmentLocalId)
      ) {
        continue;
      }
      rows.push({
        attachmentLocalId: selectedReference.attachmentLocalId,
        name: selectedReference.name ?? selectedReference.attachmentLocalId,
        mediaType: selectedReference.mediaType,
        downloadStatus: selectedReference.downloadStatus,
        selectedReference,
      });
    }
    if (rows.length === 0) return null;
    return (
      <div className="mt-3 border-t border-border/50 pt-3">
        <h4 className="mb-2 text-xs font-semibold text-text-muted">
          {intl.formatMessage(messages.attachments)}
        </h4>
        <div className="space-y-2">
          {rows.map((attachment) => {
            const selected = attachment.selectedReference !== undefined;
            return (
              <label
                key={attachment.attachmentLocalId}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-button bg-surface-container-low px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) =>
                    setAttachmentSelected.mutate({
                      projectLocalId,
                      caseLocalId,
                      evidenceLocalId: evidence.localId,
                      attachmentLocalId: attachment.attachmentLocalId,
                      selected: event.currentTarget.checked,
                    })
                  }
                  aria-label={intl.formatMessage(messages.includeAttachment, {
                    name: attachment.name,
                  })}
                  className="h-5 w-5 accent-primary"
                />
                <span className="min-w-0 flex-1 break-words text-text">
                  {attachment.name}
                </span>
                <span className="text-xs uppercase text-text-muted">
                  {attachment.mediaType}
                </span>
                {attachment.selectedReference?.availability === 'deleted' ? (
                  <span className="text-xs font-medium text-error">
                    {intl.formatMessage(messages.deletedMedia)}
                  </span>
                ) : null}
                {attachment.selectedReference?.availability ===
                'unavailable' ? (
                  <span className="text-xs font-medium text-error">
                    {intl.formatMessage(messages.unavailableMedia)}
                  </span>
                ) : null}
                {attachment.selectedReference?.freshness === 'changed' ? (
                  <span className="text-xs font-medium text-warning">
                    {intl.formatMessage(messages.mediaChanged)}
                  </span>
                ) : null}
                {attachment.downloadStatus !== 'available' ? (
                  <span className="text-xs font-medium text-warning">
                    {intl.formatMessage(messages.remoteOnly)}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSelectedCard(
    evidence: ResolvedCaseEvidence,
    timeline = false,
  ) {
    const item = itemByKey.get(
      `${evidence.sourceType}:${evidence.sourceLocalId}`,
    );
    const name =
      item?.name ??
      `${typeLabels[evidence.sourceType]} ${evidence.sourceLocalId}`;
    const eventDate = item ? getItemCreatedAt(item) : evidence.addedAt;
    return (
      <div
        key={evidence.localId}
        className={timeline ? 'grid grid-cols-[auto_1fr] gap-3' : ''}
      >
        {timeline ? (
          <time
            className="pt-4 text-xs font-medium text-text-muted"
            dateTime={eventDate}
          >
            {intl.formatDate(new Date(eventDate), {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        ) : null}
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-text-muted">
                  {typeLabels[evidence.sourceType]}
                </span>
                {renderWarnings(evidence)}
              </div>
              <h3 className="break-words text-sm font-semibold text-text">
                {name}
              </h3>
              {!timeline ? (
                <time
                  className="mt-1 block text-xs text-text-muted"
                  dateTime={eventDate}
                >
                  {intl.formatDate(new Date(eventDate), {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                removeEvidence.mutate({
                  projectLocalId,
                  caseLocalId,
                  evidenceLocalId: evidence.localId,
                })
              }
              aria-label={intl.formatMessage(messages.removeSource, {
                type: typeLabels[evidence.sourceType],
                name,
              })}
            >
              {intl.formatMessage(messages.remove)}
            </Button>
          </div>
          {renderAttachments(evidence)}
        </Card>
      </div>
    );
  }

  function renderSelectedEvidence() {
    if (selectedEvidence.length === 0) {
      return (
        <p className="text-sm text-text-muted">
          {intl.formatMessage(messages.noSelected)}
        </p>
      );
    }
    if (selectedView === 'map') {
      return (
        <CaseEvidenceMap
          evidence={selectedEvidence}
          observations={observationsQuery.data ?? []}
          alerts={alertsQuery.data ?? []}
          tracks={tracksQuery.data ?? []}
          evidenceCount={selectedEvidence.length}
        />
      );
    }
    return (
      <div className="space-y-3">
        {selectedEvidence.map((evidence) =>
          renderSelectedCard(evidence, selectedView === 'timeline'),
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="case-evidence-browse-heading"
        className="space-y-4"
      >
        <div>
          <h2
            id="case-evidence-browse-heading"
            className="text-lg font-semibold text-text"
          >
            {intl.formatMessage(messages.browseTitle)}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Input
              label={intl.formatMessage(messages.search)}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Evidence type"
            >
              {(
                [
                  ['all', messages.all],
                  ['observation', messages.observations],
                  ['alert', messages.alerts],
                  ['track', messages.tracks],
                ] as const
              ).map(([value, descriptor]) => (
                <Button
                  key={value}
                  type="button"
                  variant={filter === value ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {intl.formatMessage(descriptor)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <p className="text-sm text-text-muted">
            {intl.formatMessage(messages.noProjectEvidence)}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredItems.map((item) => {
              const evidence = evidenceBySourceKey.get(
                `${item.sourceType}:${item.source.localId}`,
              );
              const type = sourceTypeLabel(item.sourceType, typeLabels);
              return (
                <Card
                  key={`${item.sourceType}:${item.source.localId}`}
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold uppercase text-text-muted">
                        {type}
                      </span>
                      <h3 className="break-words text-sm font-semibold text-text">
                        {item.name}
                      </h3>
                      <time
                        className="mt-1 block text-xs text-text-muted"
                        dateTime={getItemCreatedAt(item)}
                      >
                        {intl.formatDate(new Date(getItemCreatedAt(item)), {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </div>
                    {evidence ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          removeEvidence.mutate({
                            projectLocalId,
                            caseLocalId,
                            evidenceLocalId: evidence.localId,
                          })
                        }
                        aria-label={intl.formatMessage(messages.removeSource, {
                          type,
                          name: item.name,
                        })}
                      >
                        {intl.formatMessage(messages.remove)}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          addEvidence.mutate({
                            projectLocalId,
                            caseLocalId,
                            sourceType: item.sourceType,
                            sourceLocalId: item.source.localId,
                          })
                        }
                        aria-label={intl.formatMessage(messages.addSource, {
                          type,
                          name: item.name,
                        })}
                      >
                        {intl.formatMessage(messages.add)}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby="case-evidence-selected-heading"
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="case-evidence-selected-heading"
            className="text-lg font-semibold text-text"
          >
            {intl.formatMessage(messages.selectedTitle)} (
            {selectedEvidence.length})
          </h2>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Evidence view"
          >
            {(
              [
                ['list', messages.list],
                ['timeline', messages.timeline],
                ['map', messages.map],
              ] as const
            ).map(([value, descriptor]) => (
              <Button
                key={value}
                variant={selectedView === value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedView(value)}
                aria-pressed={selectedView === value}
              >
                {intl.formatMessage(descriptor)}
              </Button>
            ))}
          </div>
        </div>

        {renderSelectedEvidence()}
      </section>
    </div>
  );
}
