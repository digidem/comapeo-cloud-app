import { useState } from 'react';
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
}

const messages = defineMessages({
  url: {
    id: 'home.archive.detail.url',
    defaultMessage: 'URL',
  },
  status: {
    id: 'home.archive.detail.status',
    defaultMessage: 'Status',
  },
  lastSynced: {
    id: 'home.archive.detail.lastSynced',
    defaultMessage: 'Last synced',
  },
  error: {
    id: 'home.archive.detail.error',
    defaultMessage: 'Error',
  },
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
  syncing: {
    id: 'home.archive.syncing',
    defaultMessage: 'Syncing...',
  },
  remove: {
    id: 'home.archive.remove',
    defaultMessage: 'Remove',
  },
  edit: {
    id: 'home.archive.edit',
    defaultMessage: 'Edit',
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
  never: {
    id: 'home.archive.detail.never',
    defaultMessage: 'Never',
  },
  retrySync: {
    id: 'home.archive.detail.retrySync',
    defaultMessage: 'Retry Sync',
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
  statsTitle: {
    id: 'home.archive.detail.statsTitle',
    defaultMessage: 'Summary',
  },
  statsProjects: {
    id: 'home.archive.detail.statsProjects',
    defaultMessage: '{count, plural, one {# project} other {# projects}}',
  },
  statsObservations: {
    id: 'home.archive.detail.statsObservations',
    defaultMessage:
      '{count, plural, one {# observation} other {# observations}}',
  },
  statsAlerts: {
    id: 'home.archive.detail.statsAlerts',
    defaultMessage: '{count, plural, one {# alert} other {# alerts}}',
  },
  statsNoData: {
    id: 'home.archive.detail.statsNoData',
    defaultMessage: 'No data synced yet',
  },
  viewData: {
    id: 'home.archive.detail.viewData',
    defaultMessage: 'View Data',
  },
});

function resolveStatusLabel(server: ArchiveServerStatus): string {
  if (server.isSyncing) return 'Syncing';
  if (server.error) return 'Error';
  if (server.lastSyncedAt) return 'OK';
  return 'Idle';
}

function ArchiveServerDetail({
  server,
  onSync,
  onRemove,
}: ArchiveServerDetailProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const servers = useAuthStore((s) => s.servers);

  // Get the full server record from the store for the edit dialog.
  // Fall back to constructing a minimal object from the status props so the
  // dialog always works even when the store hasn't hydrated yet.
  const fullServer: RemoteArchiveServer = servers.find(
    (s) => s.id === server.id,
  ) ?? {
    id: server.id,
    label: server.label,
    baseUrl: server.baseUrl,
    token: '',
    status: 'idle',
  };

  function handleRemoveClick() {
    setIsConfirmRemoveOpen(true);
  }

  const matchingProjects = projects.filter(
    (p) => p.serverUrl === server.baseUrl,
  );

  // Dashboard stats: aggregate observations and alerts across all projects for this server
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
  const totalObservations = projectQueries
    .filter((_, i) => i % 2 === 0)
    .reduce(
      (sum, q) => sum + ((q.data as unknown[] | undefined)?.length ?? 0),
      0,
    );
  const totalAlerts = projectQueries
    .filter((_, i) => i % 2 === 1)
    .reduce(
      (sum, q) => sum + ((q.data as unknown[] | undefined)?.length ?? 0),
      0,
    );

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    void navigate({ to: '/data' });
  }

  async function handleConfirmRemove() {
    setIsConfirmRemoveOpen(false);
    // Reassign all projects that belong to this server to Local (serverUrl = null)
    await Promise.all(
      matchingProjects.map((p) =>
        updateProject(p.localId, { serverUrl: null }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    onRemove(server.id);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header: server name + action buttons */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold text-text">{server.label}</h2>

        <div className="flex flex-wrap items-center gap-2">
          {!server.hasCredentials && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsEditDialogOpen(true)}
            >
              {intl.formatMessage(messages.reconnect)}
            </Button>
          )}

          {server.hasCredentials && !server.isSyncing && !server.error && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSync(server.id)}
            >
              {intl.formatMessage(messages.sync)}
            </Button>
          )}

          {server.hasCredentials && !server.isSyncing && server.error && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSync(server.id)}
            >
              {intl.formatMessage(messages.retrySync)}
            </Button>
          )}

          {server.hasCredentials && server.isSyncing && (
            <Button variant="secondary" size="sm" loading disabled>
              {intl.formatMessage(messages.syncing)}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditDialogOpen(true)}
          >
            {intl.formatMessage(messages.edit)}
          </Button>

          <Button variant="danger" size="sm" onClick={handleRemoveClick}>
            {intl.formatMessage(messages.remove)}
          </Button>
        </div>
      </div>

      {/* Server info */}
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium text-text-muted min-w-24">
            {intl.formatMessage(messages.url)}
          </dt>
          <dd className="text-text">{server.baseUrl}</dd>
        </div>

        <div className="flex gap-2">
          <dt className="font-medium text-text-muted min-w-24">
            {intl.formatMessage(messages.status)}
          </dt>
          <dd className="text-text">{resolveStatusLabel(server)}</dd>
        </div>

        <div className="flex gap-2">
          <dt className="font-medium text-text-muted min-w-24">
            {intl.formatMessage(messages.lastSynced)}
          </dt>
          <dd className={server.lastSyncedAt ? 'text-text' : 'text-text-muted'}>
            {server.lastSyncedAt ?? intl.formatMessage(messages.never)}
          </dd>
        </div>

        {!server.hasCredentials && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm font-medium text-warning">
              {intl.formatMessage(messages.reconnectDescription)}
            </p>
          </div>
        )}

        {server.error && (
          <div className="flex gap-2">
            <dt className="font-medium text-text-muted min-w-24">
              {intl.formatMessage(messages.error)}
            </dt>
            <dd className="text-error">{server.error}</dd>
          </div>
        )}

        {!server.hasCredentials && (
          <div className="flex gap-2">
            <dt className="font-medium text-text-muted min-w-24">
              {intl.formatMessage(messages.error)}
            </dt>
            <dd className="text-text-muted">
              {intl.formatMessage(messages.credentialsUnavailable)}
            </dd>
          </div>
        )}

        {server.isStale && server.hasCredentials && !server.error && (
          <div className="flex gap-2">
            <dt className="font-medium text-warning min-w-24">⚠ </dt>
            <dd className="text-warning">
              {intl.formatMessage(messages.staleToken)}
            </dd>
          </div>
        )}
      </dl>

      {/* Dashboard stats */}
      {matchingProjects.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text">
            {intl.formatMessage(messages.statsTitle)}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-card bg-surface-container-low p-3 text-center">
              <div className="text-lg font-bold text-text">
                {matchingProjects.length}
              </div>
              <div className="text-xs text-text-muted">
                {intl.formatMessage(messages.statsProjects, {
                  count: matchingProjects.length,
                })}
              </div>
            </div>
            <div className="rounded-card bg-surface-container-low p-3 text-center">
              <div className="text-lg font-bold text-text">
                {totalObservations}
              </div>
              <div className="text-xs text-text-muted">
                {intl.formatMessage(messages.statsObservations, {
                  count: totalObservations,
                })}
              </div>
            </div>
            <div className="rounded-card bg-surface-container-low p-3 text-center">
              <div className="text-lg font-bold text-text">{totalAlerts}</div>
              <div className="text-xs text-text-muted">
                {intl.formatMessage(messages.statsAlerts, {
                  count: totalAlerts,
                })}
              </div>
            </div>
          </div>
          {/* Project list with select buttons */}
          <div className="flex flex-col gap-1">
            {matchingProjects.map((project) => (
              <div
                key={project.localId}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-container-low transition-colors"
              >
                <span className="text-sm text-text">
                  {project.name ?? intl.formatMessage(messages.statsNoData)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSelectProject(project.localId)}
                >
                  {intl.formatMessage(messages.viewData)}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <EditArchiveServerDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        server={fullServer}
      />

      {/* Remove confirmation dialog */}
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
        <div className="flex justify-end gap-2 mt-4">
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
    </div>
  );
}

export { ArchiveServerDetail };
export type { ArchiveServerDetailProps };
