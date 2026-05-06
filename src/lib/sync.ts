import { getRemoteServer } from '@/lib/local-repositories';
import {
  pullAlerts,
  pullObservations,
  pullProjects,
} from '@/lib/remote-archive';
import { useAuthStore } from '@/stores/auth-store';

export interface SyncOptions {
  baseUrl: string;
  token: string;
  serverLabel?: string;
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

async function ensureServerInStore(
  options: SyncOptions,
): Promise<string | null> {
  const { servers } = useAuthStore.getState();
  let server = servers.find((s) => s.baseUrl === options.baseUrl);
  if (!server) {
    await useAuthStore.getState().addServer({
      label: options.serverLabel ?? options.baseUrl,
      baseUrl: options.baseUrl,
      token: options.token,
    });
    const updated = useAuthStore.getState().servers;
    server = updated.find((s) => s.baseUrl === options.baseUrl) ?? null;
  }
  return server?.id ?? null;
}

export async function syncRemoteArchive(
  serverDbId: string,
  options: SyncOptions,
): Promise<SyncResult> {
  try {
    // Ensure server is in the auth store so sync status tracking works
    await ensureServerInStore(options);

    const serverRecord = await getRemoteServer(serverDbId);
    if (!serverRecord) {
      return {
        success: false,
        error: `Server ${serverDbId} not found in database`,
      };
    }

    // Update server status to syncing
    await useAuthStore.getState().updateServerStatus(serverDbId, 'syncing');

    const config = { baseUrl: options.baseUrl, token: options.token };

    // Pull projects
    const projects = await pullProjects(config);

    // Pull observations and alerts for each project
    for (const project of projects) {
      if (project.remoteId) {
        await pullObservations(project.remoteId, config);
        await pullAlerts(project.remoteId, config);
      }
    }

    // Mark server as connected
    await useAuthStore.getState().updateServerStatus(serverDbId, 'connected');

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown sync error';
    // Update server status to error
    const existing = useAuthStore
      .getState()
      .servers.find((s) => s.baseUrl === options.baseUrl);
    if (existing) {
      await useAuthStore
        .getState()
        .updateServerStatus(existing.id, 'error', errorMessage);
    }
    return { success: false, error: errorMessage };
  }
}
