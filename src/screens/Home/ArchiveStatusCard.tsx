import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';

interface ArchiveStatusCardProps {
  server: ArchiveServerStatus;
  isSelected: boolean;
  onSelect: (serverId: string) => void;
}

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
}: ArchiveStatusCardProps) {
  const status = resolveServerStatus(server);

  return (
    <button
      type="button"
      onClick={() => onSelect(server.id)}
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
      <span className="truncate">{server.label}</span>
    </button>
  );
}

export { ArchiveStatusCard };
export type { ArchiveStatusCardProps };
