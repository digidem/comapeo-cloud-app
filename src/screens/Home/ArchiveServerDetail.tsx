import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useProjects } from '@/hooks/useProjects';
import { updateProject } from '@/lib/data-layer';
import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';

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
