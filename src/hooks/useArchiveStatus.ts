import { useAuthStore } from '@/stores/auth-store';

export interface ArchiveServerStatus {
  id: string;
  label: string;
  baseUrl: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  hasCredentials: boolean;
}

export interface ArchiveStatus {
  servers: ArchiveServerStatus[];
  anyError: boolean;
  anySyncing: boolean;
}

export function useArchiveStatus(): ArchiveStatus {
  const servers = useAuthStore((s) => s.servers);

  const mapped: ArchiveServerStatus[] = servers.map((s) => ({
    id: s.id,
    label: s.label,
    baseUrl: s.baseUrl,
    isSyncing: s.status === 'syncing',
    lastSyncedAt: s.lastSyncedAt ?? null,
    error: s.status === 'error' ? (s.errorMessage ?? 'Unknown error') : null,
    hasCredentials: typeof s.token === 'string' && s.token.length > 0,
  }));

  return {
    servers: mapped,
    anyError: mapped.some((s) => s.error !== null),
    anySyncing: mapped.some((s) => s.isSyncing),
  };
}
