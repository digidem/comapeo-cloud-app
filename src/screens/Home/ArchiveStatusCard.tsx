import { defineMessages, useIntl } from 'react-intl';

import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';

interface ArchiveStatusCardProps {
  server: ArchiveServerStatus;
  onSync: (serverId: string) => void;
}

const messages = defineMessages({
  statusOk: {
    id: 'home.archive.status.ok',
    defaultMessage: 'OK',
  },
  statusError: {
    id: 'home.archive.status.error',
    defaultMessage: 'Error',
  },
  statusSyncing: {
    id: 'home.archive.status.syncing',
    defaultMessage: 'Syncing',
  },
  statusIdle: {
    id: 'home.archive.status.idle',
    defaultMessage: 'Idle',
  },
  lastSynced: {
    id: 'home.archive.lastSynced',
    defaultMessage: 'Last synced: {date}',
  },
  credentialsUnavailable: {
    id: 'home.archive.credentialsUnavailable',
    defaultMessage: 'Credentials unavailable.',
  },
  settingsLink: {
    id: 'home.archive.settingsLink',
    defaultMessage: 'Go to Settings',
  },
  sync: {
    id: 'home.archive.sync',
    defaultMessage: 'Sync Now',
  },
  syncing: {
    id: 'home.archive.syncing',
    defaultMessage: 'Syncing...',
  },
});

function StatusBadge({
  status,
}: {
  status: 'ok' | 'error' | 'syncing' | 'idle';
}) {
  const intl = useIntl();
  const styles: Record<string, string> = {
    ok: 'bg-success-soft text-success',
    error: 'bg-error-soft text-error',
    syncing: 'bg-info-soft text-info',
    idle: 'bg-tag-neutral-bg text-tag-neutral-text',
  };

  const labels: Record<string, keyof typeof messages> = {
    ok: 'statusOk',
    error: 'statusError',
    syncing: 'statusSyncing',
    idle: 'statusIdle',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles['idle']}`}
    >
      {intl.formatMessage(messages[labels[status] ?? 'statusIdle'])}
    </span>
  );
}

function ArchiveStatusCard({ server, onSync }: ArchiveStatusCardProps) {
  const intl = useIntl();
  function resolveStatus() {
    if (server.isSyncing) return 'syncing';
    if (server.error) return 'error';
    if (server.lastSyncedAt) return 'ok';
    return 'idle';
  }
  const currentStatus = resolveStatus();

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text truncate">
          {server.label}
        </span>
        <StatusBadge status={currentStatus} />
      </div>

      {server.lastSyncedAt && (
        <p className="text-xs text-text-muted">
          {intl.formatMessage(messages.lastSynced, {
            date: new Date(server.lastSyncedAt).toLocaleString(),
          })}
        </p>
      )}

      {server.error && <p className="text-xs text-error">{server.error}</p>}

      {!server.hasCredentials && (
        <p className="text-xs text-text-muted">
          {intl.formatMessage(messages.credentialsUnavailable)}{' '}
          <Link
            to="/settings"
            className="text-primary underline hover:no-underline"
          >
            {intl.formatMessage(messages.settingsLink)}
          </Link>
        </p>
      )}

      {server.hasCredentials && server.isSyncing && (
        <Button variant="secondary" size="sm" loading disabled>
          {intl.formatMessage(messages.syncing)}
        </Button>
      )}

      {server.hasCredentials && !server.isSyncing && (
        <Button variant="secondary" size="sm" onClick={() => onSync(server.id)}>
          {intl.formatMessage(messages.sync)}
        </Button>
      )}
    </div>
  );
}

export { ArchiveStatusCard };
export type { ArchiveStatusCardProps };
