import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';

import { EditArchiveServerDialog } from './EditArchiveServerDialog';

interface ArchiveStatusCardProps {
  server: ArchiveServerStatus;
  isSelected: boolean;
  onSelect: (serverId: string) => void;
  onRemove: (serverId: string) => void;
}

const messages = defineMessages({
  edit: {
    id: 'home.archive.edit',
    defaultMessage: 'Edit',
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
});

function resolveServerStatus(server: ArchiveServerStatus) {
  if (server.isSyncing) return 'syncing';
  if (server.error) return 'error';
  if (server.lastSyncedAt) return 'ok';
  return 'idle';
}

const DOT_COLORS: Record<string, string> = {
  ok: 'bg-success',
  error: 'bg-error',
  syncing: 'bg-info',
  idle: 'bg-tag-neutral-text',
};

function ArchiveStatusCard({
  server,
  isSelected,
  onSelect,
  onRemove,
}: ArchiveStatusCardProps) {
  const intl = useIntl();
  const status = resolveServerStatus(server);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);

  const authServers = useAuthStore((s) => s.servers);

  // Get the full server record from the store for the edit dialog.
  // Fall back to constructing a minimal object from the status props so the
  // dialog always works even when the store hasn't hydrated yet.
  const fullServer: RemoteArchiveServer = authServers.find(
    (s) => s.id === server.id,
  ) ?? {
    id: server.id,
    label: server.label,
    baseUrl: server.baseUrl,
    token: '',
    status: 'idle',
  };

  function handleSelect() {
    onSelect(server.id);
  }

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditDialogOpen(true);
  }

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsConfirmRemoveOpen(true);
  }

  function handleConfirmRemove() {
    setIsConfirmRemoveOpen(false);
    onRemove(server.id);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect();
          }
        }}
        data-testid="archive-status-card"
        className={`w-full text-left px-3 py-2 min-h-[44px] rounded-btn text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary flex items-center gap-2 ${
          isSelected
            ? 'bg-primary-soft text-primary'
            : 'text-text hover:bg-surface'
        }`}
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[status] ?? DOT_COLORS['idle']}`}
          aria-hidden="true"
        />
        <span className="truncate flex-1">{server.label}</span>

        <span className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleEditClick}
            className="min-h-[28px] min-w-[28px] px-1.5"
          >
            {intl.formatMessage(messages.edit)}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleRemoveClick}
            className="min-h-[28px] min-w-[28px] px-1.5"
          >
            {intl.formatMessage(messages.remove)}
          </Button>
        </span>
      </div>

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
        description={intl.formatMessage(messages.confirmRemoveDescription, {
          name: server.label,
        })}
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
    </>
  );
}

export { ArchiveStatusCard };
export type { ArchiveStatusCardProps };
