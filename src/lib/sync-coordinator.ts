import { apiClient } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { queryClient } from '@/lib/query-client';
import {
  type SyncOptions,
  type SyncResult,
  syncRemoteArchive,
} from '@/lib/sync';
import { type ArchiveLifecycleStatus, useAuthStore } from '@/stores/auth-store';

export type OnboardingSource = 'manual' | 'invite';

export interface OnboardArchiveOptions extends SyncOptions {
  label: string;
  source: OnboardingSource;
  onStateChange?: (status: ArchiveLifecycleStatus) => void;
  isCancelled?: () => boolean;
}

export interface OnboardingResult extends SyncResult {
  errorCode?:
    | 'invalid-url'
    | 'connection'
    | 'authorization'
    | 'duplicate'
    | 'cancelled';
}

const VALIDATION_TIMEOUT_MS = 10_000;
const CANCELLATION_POLL_MS = 50;
const INVALIDATED_QUERY_ROOTS = new Set([
  'projects',
  'observations',
  'alerts',
  'tracks',
  'presets',
  'fields',
  'attachments',
]);

async function invalidateSyncedData(): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) =>
      INVALIDATED_QUERY_ROOTS.has(String(query.queryKey[0] ?? '')),
  });
}

interface CancellationBridge {
  signal: AbortSignal;
  dispose: () => void;
}

function createCancellationBridge(
  signal?: AbortSignal,
  isCancelled?: () => boolean,
): CancellationBridge {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  if (signal?.aborted || isCancelled?.()) {
    abort();
  } else {
    signal?.addEventListener('abort', abort, { once: true });
    if (isCancelled) {
      intervalId = setInterval(() => {
        if (isCancelled()) abort();
      }, CANCELLATION_POLL_MS);
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      signal?.removeEventListener('abort', abort);
      if (intervalId !== undefined) clearInterval(intervalId);
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error || (error !== null && typeof error === 'object')) &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

async function withValidationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Archive validation timed out')),
      VALIDATION_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function missingServerResult(serverId: string): SyncResult {
  return {
    success: false,
    status: 'error',
    serverId,
    projects: [],
    warnings: [],
    error: `Server ${serverId} not found`,
  };
}

function cancelledSyncResult(
  serverId: string,
  underlyingAborted = true,
): SyncResult {
  return {
    success: false,
    status: 'cancelled',
    serverId,
    projects: [],
    warnings: [],
    error: 'Sync cancelled',
    underlyingAborted,
  };
}

function cancelledOnboardingResult(serverId: string): OnboardingResult {
  return {
    ...cancelledSyncResult(serverId),
    error: 'Onboarding cancelled',
    errorCode: 'cancelled',
  };
}

function lifecycleForResult(result: SyncResult): {
  status: 'connected' | 'partial' | 'error' | 'cancelled';
  onboardingStatus: 'ready' | 'partial' | 'error' | 'cancelled';
  errorMessage?: string;
  lastSuccessfulSyncAt?: string;
} {
  if (result.status === 'ready') {
    return {
      status: 'connected',
      onboardingStatus: 'ready',
      errorMessage: undefined,
      lastSuccessfulSyncAt: new Date().toISOString(),
    };
  }

  if (result.status === 'partial') {
    return {
      status: 'partial',
      onboardingStatus: 'partial',
      errorMessage: result.error ?? result.warnings.join('; '),
    };
  }

  if (result.status === 'cancelled') {
    return {
      status: 'cancelled',
      onboardingStatus: 'cancelled',
      errorMessage: undefined,
    };
  }

  return {
    status: 'error',
    onboardingStatus: 'error',
    errorMessage: result.error,
  };
}

interface SyncArchiveControl {
  isCancelled?: () => boolean;
}

export function syncArchive(
  serverId: string,
  options?: SyncOptions,
  control?: SyncArchiveControl,
): Promise<SyncResult> {
  const server = useAuthStore
    .getState()
    .servers.find((candidate) => candidate.id === serverId);
  const resolvedOptions =
    options ??
    (server
      ? {
          baseUrl: server.baseUrl,
          token: server.token,
          serverLabel: server.label,
        }
      : null);

  if (!resolvedOptions) return Promise.resolve(missingServerResult(serverId));

  const cancellation = createCancellationBridge(
    resolvedOptions.signal,
    control?.isCancelled,
  );

  return (async () => {
    try {
      await useAuthStore.getState().updateServerLifecycle(serverId, {
        status: 'syncing',
        onboardingStatus: 'syncing',
        errorMessage: undefined,
      });

      let result: SyncResult;
      try {
        result = await syncRemoteArchive(serverId, {
          ...resolvedOptions,
          signal: cancellation.signal,
        });
      } catch (error) {
        result = isAbortError(error)
          ? cancelledSyncResult(serverId)
          : {
              success: false,
              status: 'error',
              serverId,
              projects: [],
              warnings: [],
              error:
                error instanceof Error ? error.message : 'Unknown sync error',
            };
      }

      if (cancellation.signal.aborted && result.status !== 'cancelled') {
        result = cancelledSyncResult(serverId);
      }

      if (result.status === 'cancelled') {
        // A subscriber-only cancellation must not overwrite the lifecycle of a
        // shared run that still has another active subscriber.
        if (result.underlyingAborted !== false) {
          await cancelArchiveOnboarding(serverId);
          await invalidateSyncedData();
        }
      } else {
        await useAuthStore
          .getState()
          .updateServerLifecycle(serverId, lifecycleForResult(result));
        await invalidateSyncedData();
      }
      return result;
    } finally {
      cancellation.dispose();
    }
  })();
}

export async function onboardArchive(
  options: OnboardArchiveOptions,
): Promise<OnboardingResult> {
  const cancellation = createCancellationBridge(
    options.signal,
    options.isCancelled,
  );
  try {
    return await onboardArchiveWithSignal(options, cancellation.signal);
  } finally {
    cancellation.dispose();
  }
}

async function onboardArchiveWithSignal(
  options: OnboardArchiveOptions,
  signal: AbortSignal,
): Promise<OnboardingResult> {
  options.onStateChange?.('validating');
  const normalized = normalizeArchiveBaseUrl(options.baseUrl);
  if (!normalized.ok) {
    return {
      ...missingServerResult(''),
      error: 'Invalid archive URL',
      errorCode: 'invalid-url',
    };
  }

  const config = {
    baseUrl: normalized.value,
    token: options.token,
    signal,
  };
  try {
    const healthy = await withValidationTimeout(apiClient.healthCheck(config));
    if (!healthy) {
      return {
        ...missingServerResult(''),
        error: 'Could not connect to server',
        errorCode: 'connection',
      };
    }

    await withValidationTimeout(apiClient.getProjects(config));
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      options.onStateChange?.('cancelled');
      return cancelledOnboardingResult('');
    }
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number(error.status)
        : undefined;
    return {
      ...missingServerResult(''),
      error:
        status === 401 || status === 403
          ? 'Invalid token or unauthorized'
          : 'Could not connect to server',
      errorCode:
        status === 401 || status === 403 ? 'authorization' : 'connection',
    };
  }

  if (signal.aborted || options.isCancelled?.()) {
    options.onStateChange?.('cancelled');
    return cancelledOnboardingResult('');
  }

  const existing = useAuthStore
    .getState()
    .servers.find((server) => server.baseUrl === normalized.value);
  if (
    existing &&
    (existing.status === 'connected' || existing.onboardingStatus === 'ready')
  ) {
    return {
      ...missingServerResult(existing.id),
      error: 'This archive server is already connected',
      errorCode: 'duplicate',
    };
  }

  const serverId = await useAuthStore.getState().addServer({
    label: options.label,
    baseUrl: normalized.value,
    token: options.token,
    allowDuplicate: true,
  });
  if (signal.aborted || options.isCancelled?.()) {
    await cancelArchiveOnboarding(serverId);
    options.onStateChange?.('cancelled');
    return cancelledOnboardingResult(serverId);
  }

  await useAuthStore.getState().updateServerLifecycle(serverId, {
    status: 'pending',
    onboardingStatus: 'pending',
    errorMessage: undefined,
  });
  options.onStateChange?.('pending');
  if (signal.aborted || options.isCancelled?.()) {
    await cancelArchiveOnboarding(serverId);
    options.onStateChange?.('cancelled');
    return cancelledOnboardingResult(serverId);
  }

  options.onStateChange?.('syncing');
  const result = await syncArchive(
    serverId,
    {
      baseUrl: normalized.value,
      token: options.token,
      serverLabel: options.label,
      signal,
    },
    { isCancelled: options.isCancelled },
  );
  if (signal.aborted || options.isCancelled?.()) {
    options.onStateChange?.('cancelled');
    return cancelledOnboardingResult(serverId);
  }

  options.onStateChange?.(result.status);
  return result;
}

export async function cancelArchiveOnboarding(serverId: string): Promise<void> {
  await useAuthStore.getState().updateServerLifecycle(serverId, {
    status: 'cancelled',
    onboardingStatus: 'cancelled',
    errorMessage: undefined,
  });
}

export function resetSyncCoordinatorForTests(): void {
  // In-flight request ownership lives in sync.ts. Coordinator calls are thin
  // subscribers so independent callers can cancel without cancelling others.
}
