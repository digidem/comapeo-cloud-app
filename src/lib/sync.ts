import { ApiError, type EndpointSemantics } from '@/lib/api-client';
import type { Project } from '@/lib/db';
import { getRemoteServer } from '@/lib/local-repositories';
import type { ReconciliationCounts } from '@/lib/reconciliation';
import {
  type PullResult,
  pullAlertsDetailed,
  pullFieldsDetailed,
  pullObservationsDetailed,
  pullPresetsDetailed,
  pullProjectsDetailed,
  pullTracksDetailed,
} from '@/lib/remote-archive';
import { useAuthStore } from '@/stores/auth-store';

export interface SyncConcurrencyOptions {
  projects?: number;
  resources?: number;
  projectDetails?: number;
  icons?: number;
}

export interface SyncOptions {
  baseUrl: string;
  token: string;
  serverLabel?: string;
  signal?: AbortSignal;
  concurrency?: SyncConcurrencyOptions;
}

export type SyncStatus = 'ready' | 'partial' | 'error';
export type SyncResource =
  'observations' | 'alerts' | 'presets' | 'tracks' | 'fields';

export interface ResourceSyncOutcome {
  resource: SyncResource;
  critical: boolean;
  status: 'success' | 'error' | 'skipped' | 'missing-project';
  semantics?: EndpointSemantics;
  counts?: ReconciliationCounts;
  warnings?: string[];
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
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error || (error !== null && typeof error === 'object')) &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function resultForFatalError(serverId: string, error: unknown): SyncResult {
  return {
    success: false,
    status: 'error',
    serverId,
    projects: [],
    warnings: [],
    error: errorMessage(error) || 'Unknown sync error',
  };
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal | undefined,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      throwIfAborted(signal);
      const index = cursor++;
      results[index] = await mapper(items[index]!, index);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function runResource(
  resource: SyncResource,
  critical: boolean,
  operation: () => Promise<PullResult<unknown>>,
): Promise<ResourceSyncOutcome> {
  try {
    const result = await operation();
    if (result.semantics.availability === 'unsupported') {
      return {
        resource,
        critical,
        status: 'skipped',
        semantics: result.semantics,
        counts: result.counts,
        warnings: result.warnings,
      };
    }
    return {
      resource,
      critical,
      status: 'success',
      semantics: result.semantics,
      counts: result.counts,
      warnings: result.warnings,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ApiError && error.kind === 'missing-project') {
      return {
        resource,
        critical,
        status: 'missing-project',
        error: error.message,
      };
    }
    return {
      resource,
      critical,
      status: 'error',
      error: errorMessage(error),
    };
  }
}

function summarizeProject(
  project: Project,
  resources: ResourceSyncOutcome[],
): ProjectSyncOutcome {
  const observations = resources.find(
    (outcome) => outcome.resource === 'observations',
  );
  const hasCriticalMissing = resources.some(
    (outcome) => outcome.critical && outcome.status === 'missing-project',
  );
  const hasMissingProject = resources.some(
    (outcome) => outcome.status === 'missing-project',
  );

  let status: SyncStatus = 'ready';
  // A deleted remote project is a hard failure when it affects the critical
  // resource (observations) or observations errored outright; otherwise it
  // leaves the project partially synced.
  if (observations?.status === 'error' || hasCriticalMissing) {
    status = 'error';
  } else if (hasMissingProject) {
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
  project: Project,
  options: SyncOptions,
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
  const config = {
    baseUrl: options.baseUrl,
    token: options.token,
    signal: options.signal,
  };
  const tasks: Array<{
    resource: SyncResource;
    critical: boolean;
    run: () => Promise<PullResult<unknown>>;
  }> = [
    {
      resource: 'observations',
      critical: true,
      run: () =>
        pullObservationsDetailed(serverId, remoteId, project.localId, config),
    },
    {
      resource: 'alerts',
      critical: false,
      run: () =>
        pullAlertsDetailed(serverId, remoteId, project.localId, config),
    },
    {
      resource: 'presets',
      critical: false,
      run: () =>
        pullPresetsDetailed(serverId, remoteId, project.localId, config, {
          concurrency: options.concurrency?.icons,
        }),
    },
    {
      resource: 'tracks',
      critical: false,
      run: () =>
        pullTracksDetailed(serverId, remoteId, project.localId, config),
    },
    {
      resource: 'fields',
      critical: false,
      run: () =>
        pullFieldsDetailed(serverId, remoteId, project.localId, config),
    },
  ];

  const resources = await mapLimited(
    tasks,
    options.concurrency?.resources ?? 3,
    options.signal,
    (task) => runResource(task.resource, task.critical, task.run),
  );

  return summarizeProject(project, resources);
}

function summarizeSync(
  serverId: string,
  projects: ProjectSyncOutcome[],
  initialWarnings: string[] = [],
): SyncResult {
  const remoteProjects = projects.filter((project) => project.projectRemoteId);
  const criticalFailures = remoteProjects.filter(
    (project) => project.status === 'error',
  );
  const resourceFailures = projects.flatMap((project) =>
    project.resources
      .filter(
        (resource) =>
          resource.status === 'error' || resource.status === 'missing-project',
      )
      .map(
        (resource) =>
          `${project.projectName ?? project.projectRemoteId ?? project.projectLocalId}: ${resource.resource}: ${resource.error ?? 'Unknown error'}`,
      ),
  );
  const resourceWarnings = projects.flatMap((project) =>
    project.resources.flatMap((resource) =>
      (resource.warnings ?? []).map(
        (warning) =>
          `${project.projectName ?? project.projectRemoteId ?? project.projectLocalId}: ${resource.resource}: ${warning}`,
      ),
    ),
  );
  const warnings = [
    ...initialWarnings,
    ...resourceWarnings,
    ...resourceFailures,
  ];

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
    warnings,
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
    throwIfAborted(options.signal);
    await ensureServerInStore(options);
    const serverRecord = await getRemoteServer(serverId);
    if (!serverRecord) {
      return resultForFatalError(
        serverId,
        new Error(`Server ${serverId} not found in database`),
      );
    }

    const config = {
      baseUrl: options.baseUrl,
      token: options.token,
      signal: options.signal,
    };
    const projects = await pullProjectsDetailed(serverId, config, {
      concurrency: options.concurrency?.projectDetails,
    });
    const projectResults = await mapLimited(
      projects.rows,
      options.concurrency?.projects ?? 3,
      options.signal,
      (project) => syncProject(serverId, project, options),
    );
    return summarizeSync(serverId, projectResults, projects.warnings);
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
