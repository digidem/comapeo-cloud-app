import { useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import { useProjects } from '@/hooks/useProjects';
import { getAlerts, getObservations, updateProject } from '@/lib/data-layer';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

import { EditArchiveServerDialog } from './EditArchiveServerDialog';

interface ArchiveServerDetailProps {
  server: ArchiveServerStatus;
  onSync: (serverId: string) => void;
  onRemove: (serverId: string) => void;
  onBack: () => void;
}

const messages = defineMessages({
  credentialsUnavailable: {
    id: 'home.archive.credentialsUnavailable',
    defaultMessage: 'Credentials unavailable.',
  },
  reconnect: {
    id: 'home.archive.reconnect',
    defaultMessage: 'Reconnect',
  },
  reconnectDescription: {
    id: 'home.archive.reconnectDescription',
    defaultMessage:
      'Server credentials are missing. Re-enter your token to restore sync.',
  },
  sync: {
    id: 'home.archive.sync',
    defaultMessage: 'Sync Now',
  },
  retrySync: {
    id: 'home.archive.detail.retrySync',
    defaultMessage: 'Retry Sync',
  },
  remove: {
    id: 'home.archive.remove',
    defaultMessage: 'Remove',
  },
  confirmRemove: {
    id: 'home.archive.confirmRemove.title',
    defaultMessage: 'Remove Server',
  },
  confirmRemoveDescription: {
    id: 'home.archive.confirmRemove.description',
    defaultMessage:
      'Are you sure you want to remove "{name}"? This action cannot be undone.',
  },
  confirmRemoveCancel: {
    id: 'home.archive.confirmRemove.cancel',
    defaultMessage: 'Cancel',
  },
  confirmRemoveConfirm: {
    id: 'home.archive.confirmRemove.confirm',
    defaultMessage: 'Remove',
  },
  staleToken: {
    id: 'home.archive.detail.staleToken',
    defaultMessage:
      'Warning: Token may be stale — no successful sync in over 24 hours. Try reconnecting or updating credentials.',
  },
  projectsReassigned: {
    id: 'home.archive.confirmRemove.projectsReassigned',
    defaultMessage:
      '{count, plural, one {# project will be moved to Local.} other {# projects will be moved to Local.}}',
  },
  overflowActions: {
    id: 'home.archive.detail.overflowActions',
    defaultMessage: 'Archive actions',
  },
  editAction: {
    id: 'home.archive.detail.editAction',
    defaultMessage: 'Edit archive',
  },
  copyUrl: {
    id: 'home.archive.detail.copyUrl',
    defaultMessage: 'Copy URL',
  },
  removeAction: {
    id: 'home.archive.detail.removeAction',
    defaultMessage: 'Remove archive',
  },
  synced: {
    id: 'home.archive.detail.synced',
    defaultMessage: 'Synced',
  },
  syncing: {
    id: 'home.archive.detail.syncing',
    defaultMessage: 'Syncing…',
  },
  error: {
    id: 'home.archive.detail.error',
    defaultMessage: 'Error',
  },
  offline: {
    id: 'home.archive.detail.offline',
    defaultMessage: 'Offline',
  },
  needsAttention: {
    id: 'home.archive.detail.needsAttention',
    defaultMessage: 'Needs attention',
  },
  never: {
    id: 'home.archive.detail.never',
    defaultMessage: 'Never',
  },
  today: {
    id: 'home.archive.detail.today',
    defaultMessage: 'Today',
  },
  yesterday: {
    id: 'home.archive.detail.yesterday',
    defaultMessage: 'Yesterday',
  },
  lastSync: {
    id: 'home.archive.detail.lastSync',
    defaultMessage: 'Last sync: {time}',
  },
  syncedAgo: {
    id: 'home.archive.detail.syncedAgo',
    defaultMessage: 'Synced {minutes} minutes ago',
  },
  syncedHourAgo: {
    id: 'home.archive.detail.syncedHourAgo',
    defaultMessage: 'Synced {hours} hours ago',
  },
  projects: {
    id: 'home.archive.detail.projects',
    defaultMessage: 'Projects',
  },
  observations: {
    id: 'home.archive.detail.observations',
    defaultMessage: 'Observations',
  },
  alerts: {
    id: 'home.archive.detail.alerts',
    defaultMessage: 'Alerts',
  },
  projectObservations: {
    id: 'home.archive.detail.projectObservations',
    defaultMessage:
      '{count, plural, one {# observation} other {# observations}}',
  },
  projectAlerts: {
    id: 'home.archive.detail.projectAlerts',
    defaultMessage: '{count, plural, one {# alert} other {# alerts}}',
  },
  backToArchives: {
    id: 'home.archive.detail.backToArchives',
    defaultMessage: 'Back to archives',
  },
  viewProjectData: {
    id: 'home.archive.detail.viewProjectData',
    defaultMessage: 'View observations, alerts, and project data',
  },
  advancedSettings: {
    id: 'home.archive.detail.advancedSettings',
    defaultMessage: 'Advanced Settings',
  },
  dangerZone: {
    id: 'home.archive.detail.dangerZone',
    defaultMessage: 'Danger Zone',
  },
  fullUrl: {
    id: 'home.archive.detail.fullUrl',
    defaultMessage: 'Full URL',
  },
  lastSyncIso: {
    id: 'home.archive.detail.lastSyncIso',
    defaultMessage: 'Last synced (UTC)',
  },
  noProjects: {
    id: 'home.archive.detail.noProjects',
    defaultMessage: 'No projects in this archive',
  },
  untitledProject: {
    id: 'home.archive.detail.untitledProject',
    defaultMessage: 'Untitled',
  },
});

type SyncState =
  | 'syncing'
  | 'error'
  | 'offline'
  | 'needsAttention'
  | 'synced'
  | 'idle';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatRelativeTime(
  isoString: string | null,
  locale: string,
  labels: { today: string; yesterday: string; never: string },
): string {
  if (isoString === null) return labels.never;

  const date = new Date(isoString);
  const now = new Date();
  const dateDay = startOfDay(date).getTime();
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const time = formatClock(date, locale);

  if (dateDay === today) return `${labels.today}, ${time}`;
  if (dateDay === yesterday) return `${labels.yesterday}, ${time}`;

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function resolveSyncState(server: ArchiveServerStatus): SyncState {
  if (server.isSyncing) return 'syncing';
  if (server.error) return 'error';
  if (!server.hasCredentials) return 'offline';
  if (server.isStale) return 'needsAttention';
  if (server.lastSyncedAt) return 'synced';
  return 'idle';
}

function getQueryLength(
  queries: Array<{ data?: unknown }>,
  index: number,
): number {
  return ((queries[index]?.data as unknown[] | undefined) ?? []).length;
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0 text-text-muted"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="mr-1 h-3 w-3 animate-spin rounded-full border border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}

function StatusChip({ state, label }: { state: SyncState; label: string }) {
  const classes: Record<SyncState, string> = {
    syncing: 'bg-info/10 text-info',
    synced: 'bg-success/10 text-success',
    error: 'bg-error/10 text-error',
    offline: 'bg-tag-neutral-text/10 text-tag-neutral-text',
    idle: 'bg-tag-neutral-text/10 text-tag-neutral-text',
    needsAttention: 'bg-warning/10 text-warning',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${classes[state]}`}
    >
      {state === 'syncing' && <Spinner />}
      {label}
    </span>
  );
}

function StatItem({
  value,
  label,
  prominent = false,
}: {
  value: number;
  label: string;
  prominent?: boolean;
}) {
  return (
    <div className="min-w-0 text-center">
      <div
        className={`text-lg font-bold ${prominent ? 'text-warning' : 'text-text'}`}
      >
        {value}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = 'text-text',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="font-medium text-text-muted">{label}</dt>
      <dd className={`break-words ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function ArchiveServerDetail({
  server,
  onSync,
  onRemove,
  onBack,
}: ArchiveServerDetailProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const servers = useAuthStore((s) => s.servers);

  useEffect(() => {
    if (!isOverflowOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !overflowRef.current?.contains(event.target)
      ) {
        setIsOverflowOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOverflowOpen]);

  const fullServer: RemoteArchiveServer = servers.find(
    (s) => s.id === server.id,
  ) ?? {
    id: server.id,
    label: server.label,
    baseUrl: server.baseUrl,
    token: '',
    status: 'idle',
  };

  const matchingProjects = projects.filter(
    (p) => p.serverUrl === server.baseUrl,
  );

  const setSelectedProjectId = useProjectStore((s) => s.setSelectedProjectId);
  const projectQueries = useQueries({
    queries: matchingProjects.flatMap((p) => [
      {
        queryKey: ['observations', p.localId],
        queryFn: () => getObservations(p.localId),
      },
      {
        queryKey: ['alerts', p.localId],
        queryFn: () => getAlerts(p.localId),
      },
    ]),
  });

  const totalObservations = matchingProjects.reduce(
    (sum, _project, index) => sum + getQueryLength(projectQueries, index * 2),
    0,
  );
  const totalAlerts = matchingProjects.reduce(
    (sum, _project, index) =>
      sum + getQueryLength(projectQueries, index * 2 + 1),
    0,
  );

  const syncState = resolveSyncState(server);
  const syncLabel = {
    syncing: intl.formatMessage(messages.syncing),
    synced: intl.formatMessage(messages.synced),
    error: intl.formatMessage(messages.error),
    offline: intl.formatMessage(messages.offline),
    needsAttention: intl.formatMessage(messages.needsAttention),
    idle: intl.formatMessage(messages.offline),
  }[syncState];

  const relativeSyncTime = formatRelativeTime(
    server.lastSyncedAt,
    intl.locale,
    {
      today: intl.formatMessage(messages.today),
      yesterday: intl.formatMessage(messages.yesterday),
      never: intl.formatMessage(messages.never),
    },
  );
  const lastSyncText =
    server.lastSyncedAt === null
      ? relativeSyncTime
      : intl.formatMessage(messages.lastSync, { time: relativeSyncTime });

  function formatSyncedDescription() {
    if (server.lastSyncedAt === null) return intl.formatMessage(messages.never);
    const ageMs = Math.max(
      0,
      Date.now() - new Date(server.lastSyncedAt).getTime(),
    );
    const minutes = Math.max(0, Math.floor(ageMs / 60_000));

    if (minutes < 60) {
      return intl.formatMessage(messages.syncedAgo, { minutes });
    }

    if (minutes < 24 * 60) {
      return intl.formatMessage(messages.syncedHourAgo, {
        hours: Math.floor(minutes / 60),
      });
    }

    return intl.formatMessage(messages.lastSync, { time: relativeSyncTime });
  }

  function copyUrl() {
    void navigator.clipboard?.writeText(server.baseUrl);
  }

  function handleCopyUrl() {
    copyUrl();
    setIsOverflowOpen(false);
  }

  function handleEdit() {
    setIsOverflowOpen(false);
    setIsEditDialogOpen(true);
  }

  function handleRemoveClick() {
    setIsOverflowOpen(false);
    setIsConfirmRemoveOpen(true);
  }

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    void navigate({ to: '/data' });
  }

  async function handleConfirmRemove() {
    setIsConfirmRemoveOpen(false);
    await Promise.all(
      matchingProjects.map((p) =>
        updateProject(p.localId, { serverUrl: null }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    onRemove(server.id);
  }

  return (
    <section className="flex flex-col gap-3 p-4 pb-8">
      <button
        type="button"
        onClick={onBack}
        aria-label={intl.formatMessage(messages.backToArchives)}
        className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded-btn px-1 text-sm font-semibold text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden="true">←</span>
        <span>{intl.formatMessage(messages.backToArchives)}</span>
      </button>

      <div className="rounded-xl border border-border bg-surface-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-text">
              {server.label}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-sm text-text-muted">
                {server.baseUrl}
              </span>
              <button
                type="button"
                onClick={copyUrl}
                aria-label={intl.formatMessage(messages.copyUrl)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <CopyIcon />
              </button>
            </div>
          </div>

          <div ref={overflowRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsOverflowOpen((open) => !open)}
              aria-label={intl.formatMessage(messages.overflowActions)}
              aria-expanded={isOverflowOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-text-muted hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ⋮
            </button>

            {isOverflowOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-surface-card py-1 shadow-elevated"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleEdit}
                  className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface"
                >
                  {intl.formatMessage(messages.editAction)}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyUrl}
                  className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface"
                >
                  {intl.formatMessage(messages.copyUrl)}
                </button>
                <hr className="my-1 border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleRemoveClick}
                  className="block w-full px-3 py-2 text-left text-sm text-error hover:bg-error/5"
                >
                  {intl.formatMessage(messages.removeAction)}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip state={syncState} label={syncLabel} />
          <span className="text-xs text-text-muted">{lastSyncText}</span>
        </div>

        {syncState === 'synced' && (
          <p className="mt-1 text-xs text-text-muted">
            {formatSyncedDescription()}
          </p>
        )}

        {!server.hasCredentials && (
          <p className="mt-2 rounded-lg bg-warning/5 p-3 text-sm font-medium text-warning">
            {intl.formatMessage(messages.reconnectDescription)}
          </p>
        )}

        <div className="mt-3">
          {!server.hasCredentials ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsEditDialogOpen(true)}
            >
              {intl.formatMessage(messages.reconnect)}
            </Button>
          ) : server.isSyncing ? (
            <Button variant="secondary" size="sm" loading disabled>
              {intl.formatMessage(messages.syncing)}
            </Button>
          ) : server.error ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSync(server.id)}
            >
              {intl.formatMessage(messages.retrySync)}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSync(server.id)}
            >
              {intl.formatMessage(messages.sync)}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-around">
          <StatItem
            value={matchingProjects.length}
            label={intl.formatMessage(messages.projects)}
          />
          <StatItem
            value={totalObservations}
            label={intl.formatMessage(messages.observations)}
          />
          <StatItem
            value={totalAlerts}
            label={intl.formatMessage(messages.alerts)}
            prominent={totalAlerts > 0}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-text">
          {intl.formatMessage(messages.projects)}
        </h3>

        {matchingProjects.length === 0 ? (
          <p className="py-2 text-sm text-text-muted">
            {intl.formatMessage(messages.noProjects)}
          </p>
        ) : (
          <div className="flex flex-col">
            {matchingProjects.map((project, index) => {
              const observations = getQueryLength(projectQueries, index * 2);
              const alerts = getQueryLength(projectQueries, index * 2 + 1);
              const projectName =
                project.name ?? intl.formatMessage(messages.untitledProject);
              const description =
                observations > 0 || alerts > 0
                  ? `${intl.formatMessage(messages.projectObservations, { count: observations })} · ${intl.formatMessage(messages.projectAlerts, { count: alerts })}`
                  : intl.formatMessage(messages.viewProjectData);

              return (
                <button
                  key={project.localId}
                  type="button"
                  onClick={() => handleSelectProject(project.localId)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border py-2.5 text-left transition-colors last:border-0 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">
                      {projectName}
                    </span>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {description}
                    </p>
                  </div>
                  <ChevronRightIcon />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <details className="rounded-xl border border-border bg-surface-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-text">
          {intl.formatMessage(messages.advancedSettings)}
        </summary>
        <div className="mt-3 space-y-4 text-xs text-text-muted">
          <dl className="space-y-2">
            <DetailRow
              label={intl.formatMessage(messages.fullUrl)}
              value={server.baseUrl}
            />
            <DetailRow
              label={intl.formatMessage(messages.lastSyncIso)}
              value={server.lastSyncedAt ?? intl.formatMessage(messages.never)}
            />
            {!server.hasCredentials && (
              <DetailRow
                label={intl.formatMessage(messages.error)}
                value={intl.formatMessage(messages.credentialsUnavailable)}
                valueClassName="text-warning"
              />
            )}
            {server.error && (
              <DetailRow
                label={intl.formatMessage(messages.error)}
                value={server.error}
                valueClassName="text-error"
              />
            )}
          </dl>

          {server.isStale && (
            <p className="rounded-lg bg-warning/5 p-3 text-warning">
              {intl.formatMessage(messages.staleToken)}
            </p>
          )}

          <div className="rounded-lg bg-error/5 p-3">
            <h4 className="text-sm font-semibold text-error">
              {intl.formatMessage(messages.dangerZone)}
            </h4>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={handleRemoveClick}
            >
              {intl.formatMessage(messages.removeAction)}
            </Button>
          </div>
        </div>
      </details>

      <EditArchiveServerDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        server={fullServer}
      />

      <Modal
        open={isConfirmRemoveOpen}
        onOpenChange={(open) => {
          if (!open) setIsConfirmRemoveOpen(false);
        }}
        title={intl.formatMessage(messages.confirmRemove)}
        description={
          intl.formatMessage(messages.confirmRemoveDescription, {
            name: server.label,
          }) +
          (matchingProjects.length > 0
            ? ' ' +
              intl.formatMessage(messages.projectsReassigned, {
                count: matchingProjects.length,
              })
            : '')
        }
      >
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsConfirmRemoveOpen(false)}
          >
            {intl.formatMessage(messages.confirmRemoveCancel)}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleConfirmRemove}
          >
            {intl.formatMessage(messages.confirmRemoveConfirm)}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

export { ArchiveServerDetail, formatRelativeTime };
export type { ArchiveServerDetailProps };
