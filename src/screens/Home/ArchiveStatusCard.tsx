import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';

interface ArchiveStatusCardProps {
  server: ArchiveServerStatus;
  onSync: (serverId: string) => void;
}

function StatusBadge({
  status,
}: {
  status: 'ok' | 'error' | 'syncing' | 'idle';
}) {
  const styles: Record<string, string> = {
    ok: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    syncing: 'bg-blue-100 text-blue-700',
    idle: 'bg-gray-100 text-gray-600',
  };

  const labels: Record<string, string> = {
    ok: 'OK',
    error: 'Error',
    syncing: 'Syncing',
    idle: 'Idle',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles['idle']}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function ArchiveStatusCard({ server, onSync }: ArchiveStatusCardProps) {
  function resolveStatus() {
    if (server.isSyncing) return 'syncing';
    if (server.error) return 'error';
    if (server.lastSyncedAt) return 'ok';
    return 'idle';
  }
  const currentStatus = resolveStatus();

  return (
    <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(9,30,66,0.08)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text truncate">
          {server.label}
        </span>
        <StatusBadge status={currentStatus} />
      </div>

      {server.lastSyncedAt && (
        <p className="text-xs text-text-muted">
          Last synced: {new Date(server.lastSyncedAt).toLocaleString()}
        </p>
      )}

      {server.error && <p className="text-xs text-red-500">{server.error}</p>}

      {!server.hasCredentials && (
        <p className="text-xs text-text-muted">
          Credentials unavailable.{' '}
          <Link
            to="/settings"
            className="text-primary underline hover:no-underline"
          >
            Go to Settings
          </Link>
        </p>
      )}

      {server.hasCredentials && server.isSyncing && (
        <Button variant="secondary" size="sm" loading disabled>
          Syncing...
        </Button>
      )}

      {server.hasCredentials && !server.isSyncing && (
        <Button variant="secondary" size="sm" onClick={() => onSync(server.id)}>
          Sync Now
        </Button>
      )}
    </div>
  );
}

export { ArchiveStatusCard };
export type { ArchiveStatusCardProps };
