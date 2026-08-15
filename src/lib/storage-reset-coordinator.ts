import {
  closeCategoriesDbForStorageReset,
  resetCategoriesDbIsolated,
} from '@/lib/categories-db';
import { removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { closeDbForStorageReset, resetDbIsolated } from '@/lib/db';

export const STORAGE_RESET_COORDINATION_KEY =
  '__comapeo-storage-reset-coordination-v1__';
export const STORAGE_RESET_LEASE_MS = 5_000;
const STORAGE_RESET_RECOVERY_RETRY_MS = 1_000;
const STORAGE_RESET_HEARTBEAT_MS = Math.max(
  1_000,
  Math.floor(STORAGE_RESET_LEASE_MS / 3),
);
const STORAGE_RESET_CHANNEL_NAME = 'comapeo-storage-reset';
const CROSS_TAB_QUIESCE_DELAY_MS = 100;
const STORAGE_RESET_TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type StorageResetPhase = 'start' | 'complete' | 'abort';

interface StorageResetSignal {
  version: 1;
  generation: string;
  sourceTabId: string;
  phase: StorageResetPhase;
  createdAt: number;
}

function createSignal(
  generation: string,
  phase: StorageResetPhase,
): StorageResetSignal {
  return {
    version: 1,
    generation,
    sourceTabId: STORAGE_RESET_TAB_ID,
    phase,
    createdAt: Date.now(),
  };
}

function parseSignal(value: unknown): StorageResetSignal | null {
  let candidate: unknown = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  const signal = candidate as Partial<StorageResetSignal>;
  if (
    signal.version !== 1 ||
    typeof signal.generation !== 'string' ||
    typeof signal.sourceTabId !== 'string' ||
    (signal.phase !== 'start' &&
      signal.phase !== 'complete' &&
      signal.phase !== 'abort') ||
    typeof signal.createdAt !== 'number'
  ) {
    return null;
  }
  return signal as StorageResetSignal;
}

function readCoordinationSignal(): StorageResetSignal | null {
  return parseSignal(localStorage.getItem(STORAGE_RESET_COORDINATION_KEY));
}

function postBroadcastSignal(signal: StorageResetSignal): boolean {
  if (typeof BroadcastChannel === 'undefined') return false;
  try {
    const channel = new BroadcastChannel(STORAGE_RESET_CHANNEL_NAME);
    channel.postMessage(signal);
    channel.close();
    return true;
  } catch {
    return false;
  }
}

function publishStartSignal(generation: string): StorageResetSignal | null {
  const signal = createSignal(generation, 'start');
  try {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(signal),
    );
  } catch {
    // Never broadcast an ephemeral start: another tab could quiesce without a
    // durable lease that a newly opened tab can discover or recover.
    return null;
  }
  postBroadcastSignal(signal);
  return signal;
}

/**
 * Publish reset-start before destructive database work. localStorage is required
 * because it both notifies existing tabs and lets a tab opened mid-reset discover
 * that it must remain quiesced before rendering the application.
 */
export function beginStorageResetCoordination(): string {
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signal = publishStartSignal(generation);
  if (!signal) {
    throw new Error('Could not persist the cross-tab reset lease.');
  }
  return generation;
}

/**
 * Publish a durable terminal reset phase. BroadcastChannel is only a latency
 * optimization: readiness requires localStorage persistence so newly opened tabs
 * cannot mistake a stale start marker for an active reset forever.
 */
export function finishStorageResetCoordination(
  generation: string,
  phase: Exclude<StorageResetPhase, 'start'>,
): boolean {
  const signal = createSignal(generation, phase);
  try {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(signal),
    );
  } catch {
    // Keep every tab under the durable start lease. Its expiry will trigger a
    // takeover that retries final cleanup rather than broadcasting a terminal
    // phase that contradicts the persisted coordination state.
    return false;
  }
  postBroadcastSignal(signal);
  return true;
}

export function startStorageResetLeaseHeartbeat(
  generation: string,
): () => void {
  const timer = setInterval(() => {
    try {
      const current = readCoordinationSignal();
      if (
        current?.phase !== 'start' ||
        current.generation !== generation ||
        publishStartSignal(generation) === null
      ) {
        clearInterval(timer);
      }
    } catch {
      // If durable coordination becomes unreadable, stop claiming ownership.
      // Other quiesced tabs will recover once the last durable lease expires.
      clearInterval(timer);
    }
  }, STORAGE_RESET_HEARTBEAT_MS);

  return () => clearInterval(timer);
}

export async function waitForStorageResetQuiescence(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, CROSS_TAB_QUIESCE_DELAY_MS);
  });
}

export function quiesceStorageResetConnections(): void {
  closeDbForStorageReset();
  closeCategoriesDbForStorageReset();
}

async function performFinalCleanup(): Promise<boolean> {
  quiesceStorageResetConnections();

  let categoriesCleared = false;
  let primaryCleared = false;
  try {
    await resetCategoriesDbIsolated();
    categoriesCleared = true;
  } catch {
    // Primary data contains the security-sensitive archive credentials, so its
    // cleanup must still run even when the lower-value categories cache fails.
  }
  try {
    await resetDbIsolated();
    primaryCleared = true;
  } catch {
    // Stay quiesced and retry below; never reload normal app state while the
    // security-critical primary database may still contain late writes.
  }

  const removal = removeComapeoKeys({ bestEffort: true });
  const preferencesCleared =
    !removal.enumerationFailed && removal.failedKeys.length === 0;

  return categoriesCleared && primaryCleared && preferencesCleared;
}

function remainingLeaseMs(signal: StorageResetSignal): number {
  return Math.max(
    0,
    STORAGE_RESET_LEASE_MS - Math.max(0, Date.now() - signal.createdAt),
  );
}

export function registerStorageResetCoordinator(): {
  unregister: () => void;
  resetInProgress: boolean;
} {
  if (typeof window === 'undefined') {
    return { unregister: () => {}, resetInProgress: false };
  }

  let activeGeneration: string | null = null;
  let terminalGeneration: string | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveringGeneration: string | null = null;

  const clearRecoveryTimer = () => {
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  };

  const scheduleRecovery = (signal: StorageResetSignal, delay?: number) => {
    clearRecoveryTimer();
    recoveryTimer = setTimeout(
      () => void recoverStaleReset(signal),
      delay ?? remainingLeaseMs(signal),
    );
  };

  const recoverStaleReset = async (signal: StorageResetSignal) => {
    if (
      terminalGeneration === signal.generation ||
      recoveringGeneration === signal.generation
    ) {
      return;
    }

    let current: StorageResetSignal | null = null;
    try {
      current = readCoordinationSignal();
    } catch {
      // Keep the tab quiesced and retry. A reset cannot be safely declared over
      // while its durable cross-tab state is unreadable.
    }
    if (
      current !== null &&
      (current.phase !== 'start' || current.generation !== signal.generation)
    ) {
      return;
    }

    recoveringGeneration = signal.generation;
    const cleaned = await performFinalCleanup();
    if (
      cleaned &&
      finishStorageResetCoordination(signal.generation, 'complete')
    ) {
      window.location.reload();
      return;
    }

    recoveringGeneration = null;
    const renewed = publishStartSignal(signal.generation);
    scheduleRecovery(
      renewed ?? createSignal(signal.generation, 'start'),
      renewed ? undefined : STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const finalizeResetInReceivingTab = async (signal: StorageResetSignal) => {
    const cleaned = await performFinalCleanup();
    if (cleaned) {
      window.location.reload();
      return;
    }

    // A terminal signal is not enough if this tab could not perform its final
    // sweep. Re-open the lease and keep every tab quiesced until a retry succeeds.
    terminalGeneration = null;
    const renewed = publishStartSignal(signal.generation);
    scheduleRecovery(
      renewed ?? createSignal(signal.generation, 'start'),
      renewed ? undefined : STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const handleSignal = (signal: StorageResetSignal) => {
    // BroadcastChannel delivers to other channel objects in the same browsing
    // context too. Never let the initiating tab quiesce/finalize itself.
    if (signal.sourceTabId === STORAGE_RESET_TAB_ID) return;

    if (signal.phase === 'start') {
      if (activeGeneration === signal.generation) {
        scheduleRecovery(signal);
        return;
      }
      activeGeneration = signal.generation;
      terminalGeneration = null;
      quiesceStorageResetConnections();
      scheduleRecovery(signal);
      return;
    }

    if (terminalGeneration === signal.generation) return;
    terminalGeneration = signal.generation;
    clearRecoveryTimer();

    if (signal.phase === 'complete') {
      void finalizeResetInReceivingTab(signal);
      return;
    }

    // Abort means the primary database was not cleared. Reload to reopen the
    // app connections that were deliberately quiesced at reset-start.
    window.location.reload();
  };

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== STORAGE_RESET_COORDINATION_KEY ||
      event.newValue === null ||
      (event.storageArea !== null && event.storageArea !== localStorage)
    ) {
      return;
    }
    const signal = parseSignal(event.newValue);
    if (signal) handleSignal(signal);
  };

  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(STORAGE_RESET_CHANNEL_NAME);
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const signal = parseSignal(event.data);
        if (signal) handleSignal(signal);
      });
    } catch {
      channel = null;
    }
  }

  let resetInProgress = false;
  try {
    const current = readCoordinationSignal();
    if (current?.phase === 'start') {
      activeGeneration = current.generation;
      resetInProgress = true;
      quiesceStorageResetConnections();
      scheduleRecovery(current);
    }
  } catch {
    // If storage itself is inaccessible, normal app startup handles that
    // degraded browser environment; there is no discoverable reset to join.
  }

  return {
    resetInProgress,
    unregister: () => {
      clearRecoveryTimer();
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    },
  };
}
