import { apiClient } from '@/lib/api-client';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import { queryClient } from '@/lib/query-client';
import {
  type SyncErrorCode,
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

export interface OnboardingResult extends Omit<SyncResult, 'errorCode'> {
  errorCode?: SyncErrorCode | 'invalid-url' | 'duplicate' | 'cancelled';
}

const activeRuns = new Map<string, Promise<SyncResult>>();
const VALIDATION_TIMEOUT_MS = 10_000;
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

function cancelledOnboardingResult(serverId: string): OnboardingResult {
  return {
    success: false,
    status: 'error',
    serverId,
    projects: [],
    warnings: [],
    error: 'Onboarding cancelled',
    errorCode: 'cancelled',
  };
}

function lifecycleForResult(result: SyncResult): {
  status: 'connected' | 'partial' | 'error';
  onboardingStatus: 'ready' | 'partial' | 'error';
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

  return {
    status: 'error',
    onboardingStatus: 'error',
    errorMessage: result.error,
  };
}

interface SyncArchiveControl {
  isCancelled?: () => boolean;
}

// Per-server set of cancellation callbacks. When a second caller passes a
// new `control.isCancelled` while a sync is already running, we register
// it here so the polling interval checks it too — the caller's cancel
// intent is never silently dropped.
const cancellationPollers = new Map<string, Array<() => boolean>>();

export function syncArchive(
  serverId: string,
  options?: SyncOptions,
  control?: SyncArchiveControl,
): Promise<SyncResult> {
  const existing = activeRuns.get(serverId);
  if (existing) {
    // Register the second caller's cancellation callback so it's not
    // silently dropped by the dedup.
    if (control?.isCancelled) {
      const pollers = cancellationPollers.get(serverId) ?? [];
      pollers.push(control.isCancelled);
      cancellationPollers.set(serverId, pollers);
    }
    return existing;
  }

  const server = useAuthStore
    .getState()
    .servers.find((candidate) => candidate.id === serverId);

  // Bridge isCancelled polling to an AbortController so that the AbortSignal
  // threaded through sync.ts / remote-archive.ts actually fires when the
  // caller cancels. Without this, the entire abort path is dead code.
  const abortController = new AbortController();
  const resolvedOptions: SyncOptions | null =
    options ??
    (server
      ? {
          baseUrl: server.baseUrl,
          token: server.token,
          serverLabel: server.label,
          signal: abortController.signal,
        }
      : null);

  if (options && !options.signal) {
    options.signal = abortController.signal;
  }

  if (!resolvedOptions) return Promise.resolve(missingServerResult(serverId));

  const run = (async () => {
    // Check cancellation before starting sync — abort immediately if cancelled
    if (control?.isCancelled?.()) {
      abortController.abort();
    }

    // Poll all registered cancellation callbacks at 2s intervals so
    // cancellation takes effect during the sync, not just before it starts.
    const pollers: Array<() => boolean> = [];
    if (control?.isCancelled) pollers.push(control.isCancelled);
    cancellationPollers.set(serverId, pollers);
    const pollInterval = setInterval(() => {
      for (const poller of pollers) {
        if (poller()) {
          abortController.abort();
          break;
        }
      }
    }, 2_000);

    let result: SyncResult;
    try {
      await useAuthStore.getState().updateServerLifecycle(serverId, {
        status: 'syncing',
        onboardingStatus: 'syncing',
        errorMessage: undefined,
      });

      try {
        result = await syncRemoteArchive(serverId, resolvedOptions);
      } catch (error) {
        // If cancelled, produce a cancelled-style result instead of an error
        if (control?.isCancelled?.() || abortController.signal.aborted) {
          await cancelArchiveOnboarding(serverId);
          const cancelledResult: SyncResult = {
            success: false,
            status: 'error',
            serverId,
            projects: [],
            warnings: [],
            error: 'Onboarding cancelled',
          };
          return cancelledResult;
        }
        result = {
          success: false,
          status: 'error',
          serverId,
          projects: [],
          warnings: [],
          error: error instanceof Error ? error.message : 'Unknown sync error',
        };
      }

      if (control?.isCancelled?.()) {
        await cancelArchiveOnboarding(serverId);
      } else {
        await useAuthStore
          .getState()
          .updateServerLifecycle(serverId, lifecycleForResult(result));
      }
      await invalidateSyncedData();
      return result;
    } finally {
      clearInterval(pollInterval);
      cancellationPollers.delete(serverId);
    }
  })().finally(() => {
    activeRuns.delete(serverId);
  });

  activeRuns.set(serverId, run);
  return run;
}

export async function onboardArchive(
  options: OnboardArchiveOptions,
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

  const config = { baseUrl: normalized.value, token: options.token };
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

  if (options.isCancelled?.()) {
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
  if (options.isCancelled?.()) {
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
  if (options.isCancelled?.()) {
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
    },
    { isCancelled: options.isCancelled },
  );
  if (options.isCancelled?.()) {
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
  activeRuns.clear();
}
