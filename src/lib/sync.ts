import { getRemoteServer } from '@/lib/local-repositories';
import {
  pullAlerts,
  pullFields,
  pullObservations,
  pullPresets,
  pullProjects,
  pullTracks,
} from '@/lib/remote-archive';
import { useAuthStore } from '@/stores/auth-store';

export interface SyncOptions {
  baseUrl: string;
  token: string;
  serverLabel?: string;
}

export type SyncStatus = 'ready' | 'partial' | 'error';
export type SyncResource =
  | 'observations'
  | 'alerts'
  | 'presets'
  | 'tracks'
  | 'fields';

export interface ResourceSyncOutcome {
  resource: SyncResource;
  critical: boolean;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export interface ProjectSyncOutcome {
  projectLocalId: string;
  projectRemoteId?: string;
  projectName?: string;
  status: SyncStatus;
  resources: ResourceSyncOutcome[];
}

export interface SyncResult {
  success: boolean;
  status: SyncStatus;
  serverId: string;
  projects: ProjectSyncOutcome[];
  warnings: string[];
  error?: string;
}

const activeSyncs = new Map<string, Promise<SyncResult>>();

async function ensureServerInStore(options: SyncOptions): Promise<string> {
  return useAuthStore.getState().addServer({
    label: options.serverLabel ?? options.baseUrl,
    baseUrl: options.baseUrl,
    token: options.token,
    allowDuplicate: true,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultForFatalError(serverId: string, error: unknown): SyncResult {
  return {
    success: false,
    status: 'error',
    serverId,
    projects: [],
    warnings: [],
    error: error instanceof Error ? error.message : 'Unknown sync error',
  };
}

async function runResource(
  resource: SyncResource,
  critical: boolean,
  operation: () => Promise<unknown>,
): Promise<ResourceSyncOutcome> {
  try {
    await operation();
    return { resource, critical, status: 'success' };
  } catch (error) {
    return {
      resource,
      critical,
      status: 'error',
      error: errorMessage(error),
    };
  }
}

function summarizeProject(
  project: Awaited<ReturnType<typeof pullProjects>>[number],
  resources: ResourceSyncOutcome[],
): ProjectSyncOutcome {
  const observations = resources.find(
    (outcome) => outcome.resource === 'observations',
  );
  const hasResourceError = resources.some(
    (outcome) => outcome.status === 'error',
  );
  let status: SyncStatus = 'ready';
  if (observations?.status === 'error') {
    status = 'error';
  } else if (hasResourceError) {
    status = 'partial';
  }

  return {
    projectLocalId: project.localId,
    projectRemoteId: project.remoteId,
    projectName: project.name,
    status,
    resources,
  };
}

async function syncProject(
  serverId: string,
  project: Awaited<ReturnType<typeof pullProjects>>[number],
  config: { baseUrl: string; token: string },
): Promise<ProjectSyncOutcome> {
  if (!project.remoteId) {
    return {
      projectLocalId: project.localId,
      projectName: project.name,
      status: 'ready',
      resources: [],
    };
  }

  const remoteId = project.remoteId;
  const resources = await Promise.all([
    runResource('observations', true, () =>
      pullObservations(serverId, remoteId, project.localId, config),
    ),
    runResource('alerts', false, () =>
      pullAlerts(serverId, remoteId, project.localId, config),
    ),
    runResource('presets', false, () =>
      pullPresets(serverId, remoteId, project.localId, config),
    ),
    runResource('tracks', false, () =>
      pullTracks(serverId, remoteId, project.localId, config),
    ),
    runResource('fields', false, () =>
      pullFields(serverId, remoteId, project.localId, config),
    ),
  ]);

  return summarizeProject(project, resources);
}

function summarizeSync(
  serverId: string,
  projects: ProjectSyncOutcome[],
): SyncResult {
  const remoteProjects = projects.filter((project) => project.projectRemoteId);
  const criticalFailures = remoteProjects.filter(
    (project) => project.status === 'error',
  );
  const resourceFailures = projects.flatMap((project) =>
    project.resources
      .filter((resource) => resource.status === 'error')
      .map(
        (resource) =>
          `${project.projectName ?? project.projectRemoteId ?? project.projectLocalId}: ${resource.resource}: ${resource.error ?? 'Unknown error'}`,
      ),
  );

  let status: SyncStatus = 'ready';
  if (
    remoteProjects.length > 0 &&
    criticalFailures.length === remoteProjects.length
  ) {
    status = 'error';
  } else if (projects.some((project) => project.status !== 'ready')) {
    status = 'partial';
  }

  return {
    success: status === 'ready',
    status,
    serverId,
    projects,
    warnings: resourceFailures,
    ...(status === 'ready'
      ? {}
      : {
          error:
            status === 'partial'
              ? `Partial sync: ${resourceFailures.join('; ')}`
              : resourceFailures.join('; ') || 'Sync failed',
        }),
  };
}

async function doSync(
  serverId: string,
  options: SyncOptions,
): Promise<SyncResult> {
  try {
    await ensureServerInStore(options);
    const serverRecord = await getRemoteServer(serverId);
    if (!serverRecord) {
      return resultForFatalError(
        serverId,
        new Error(`Server ${serverId} not found in database`),
      );
    }

    const config = { baseUrl: options.baseUrl, token: options.token };
    const projects = await pullProjects(serverId, config);
    const projectResults = await Promise.all(
      projects.map((project) => syncProject(serverId, project, config)),
    );
    return summarizeSync(serverId, projectResults);
  } catch (error) {
    return resultForFatalError(serverId, error);
  }
}

export function syncRemoteArchive(
  serverId: string,
  options: SyncOptions,
): Promise<SyncResult> {
  const existing = activeSyncs.get(serverId);
  if (existing) return existing;

  const run = doSync(serverId, options).finally(() => {
    activeSyncs.delete(serverId);
  });
  activeSyncs.set(serverId, run);
  return run;
}
