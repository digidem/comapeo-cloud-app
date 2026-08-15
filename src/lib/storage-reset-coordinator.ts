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
const STORAGE_RESET_LOCK_NAME = 'comapeo-storage-reset-v1';
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

type ResetClaimResult =
  | { status: 'claimed'; signal: StorageResetSignal }
  | { status: 'fresh'; signal: StorageResetSignal }
  | { status: 'superseded'; signal: StorageResetSignal | null };

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

function postBroadcastSignal(signal: StorageResetSignal): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(STORAGE_RESET_CHANNEL_NAME);
    channel.postMessage(signal);
    channel.close();
  } catch {
    // Durable localStorage remains authoritative; broadcast is only a latency aid.
  }
}

function persistSignal(signal: StorageResetSignal): boolean {
  try {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(signal),
    );
    return true;
  } catch {
    return false;
  }
}

async function withStorageResetLock<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('Cross-tab reset locking is unavailable in this browser.');
  }
  return navigator.locks.request(
    STORAGE_RESET_LOCK_NAME,
    { mode: 'exclusive' },
    async () => callback(),
  );
}

function isOwnedStart(
  signal: StorageResetSignal | null,
  generation: string,
): signal is StorageResetSignal {
  return (
    signal?.phase === 'start' &&
    signal.generation === generation &&
    signal.sourceTabId === STORAGE_RESET_TAB_ID
  );
}

function remainingLeaseMs(signal: StorageResetSignal): number {
  return Math.max(
    0,
    STORAGE_RESET_LEASE_MS - Math.max(0, Date.now() - signal.createdAt),
  );
}

/**
 * Begin a reset only while holding a cross-tab Web Lock. This makes the durable
 * generation transition atomic with respect to heartbeats, recovery takeovers,
 * and terminal publication.
 */
export async function beginStorageResetCoordination(): Promise<string> {
  return withStorageResetLock(async () => {
    const current = readCoordinationSignal();
    if (current?.phase === 'start') {
      throw new Error('Another storage reset is already in progress.');
    }

    const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const signal = createSignal(generation, 'start');
    if (!persistSignal(signal)) {
      throw new Error('Could not persist the cross-tab reset lease.');
    }
    postBroadcastSignal(signal);
    return generation;
  });
}

/**
 * Publish a terminal phase only if this tab still owns the same durable start.
 * A stale initiator cannot overwrite a recovery takeover or a newer generation.
 */
export async function finishStorageResetCoordination(
  generation: string,
  phase: Exclude<StorageResetPhase, 'start'>,
): Promise<boolean> {
  return withStorageResetLock(async () => {
    const current = readCoordinationSignal();
    if (!isOwnedStart(current, generation)) return false;

    const signal = createSignal(generation, phase);
    if (!persistSignal(signal)) return false;
    postBroadcastSignal(signal);
    return true;
  });
}

async function renewOwnedStartLease(generation: string): Promise<boolean> {
  return withStorageResetLock(async () => {
    const current = readCoordinationSignal();
    if (!isOwnedStart(current, generation)) return false;

    const renewed = createSignal(generation, 'start');
    if (!persistSignal(renewed)) return false;
    postBroadcastSignal(renewed);
    return true;
  });
}

export function startStorageResetLeaseHeartbeat(
  generation: string,
): () => void {
  let stopped = false;
  let renewalInFlight = false;
  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };

  const timer = setInterval(() => {
    if (stopped || renewalInFlight) return;
    renewalInFlight = true;
    void renewOwnedStartLease(generation)
      .then((renewed) => {
        if (!renewed) stop();
      })
      .catch(() => stop())
      .finally(() => {
        renewalInFlight = false;
      });
  }, STORAGE_RESET_HEARTBEAT_MS);

  return stop;
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
    // Primary data contains credentials, so it must still be attempted.
  }
  try {
    await resetDbIsolated();
    primaryCleared = true;
  } catch {
    // Stay quiesced; callers retry instead of reloading uncertain state.
  }

  const removal = removeComapeoKeys({ bestEffort: true });
  const preferencesCleared =
    !removal.enumerationFailed && removal.failedKeys.length === 0;

  return categoriesCleared && primaryCleared && preferencesCleared;
}

async function claimExpiredReset(
  expected: StorageResetSignal,
): Promise<ResetClaimResult> {
  return withStorageResetLock(async () => {
    const current = readCoordinationSignal();
    if (
      current?.phase !== 'start' ||
      current.generation !== expected.generation
    ) {
      return { status: 'superseded', signal: current };
    }

    if (remainingLeaseMs(current) > 0) {
      return { status: 'fresh', signal: current };
    }

    const claimed = createSignal(current.generation, 'start');
    if (!persistSignal(claimed)) {
      throw new Error('Could not persist reset recovery ownership.');
    }
    postBroadcastSignal(claimed);
    return { status: 'claimed', signal: claimed };
  });
}

async function readAuthoritativeSignalLocked(): Promise<StorageResetSignal | null> {
  return withStorageResetLock(() => readCoordinationSignal());
}

export function registerStorageResetCoordinator(): {
  unregister: () => void;
  resetInProgress: boolean;
} {
  if (typeof window === 'undefined') {
    return { unregister: () => {}, resetInProgress: false };
  }

  let terminalGeneration: string | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let finalizationTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveringGeneration: string | null = null;
  let finalizingGeneration: string | null = null;
  let stopRecoveryHeartbeat: (() => void) | null = null;

  const clearRecoveryTimer = () => {
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  };

  const clearFinalizationTimer = () => {
    if (finalizationTimer !== null) clearTimeout(finalizationTimer);
    finalizationTimer = null;
  };

  const scheduleRecovery = (signal: StorageResetSignal, delay?: number) => {
    clearRecoveryTimer();
    recoveryTimer = setTimeout(
      () => void recoverStaleReset(signal),
      delay ?? remainingLeaseMs(signal),
    );
  };

  const scheduleOwnedRecoveryRetry = (generation: string) => {
    clearRecoveryTimer();
    recoveryTimer = setTimeout(
      () => void retryOwnedRecovery(generation),
      STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const scheduleTerminalFinalizationRetry = (signal: StorageResetSignal) => {
    clearFinalizationTimer();
    finalizationTimer = setTimeout(
      () => void retryTerminalFinalization(signal),
      STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const acceptAuthoritativeStart = (signal: StorageResetSignal) => {
    terminalGeneration = null;
    quiesceStorageResetConnections();
    scheduleRecovery(signal);
  };

  const reconcileAuthoritativeState = async () => {
    let current: StorageResetSignal | null;
    try {
      current = await readAuthoritativeSignalLocked();
    } catch {
      recoveryTimer = setTimeout(
        () => void reconcileAuthoritativeState(),
        STORAGE_RESET_RECOVERY_RETRY_MS,
      );
      return;
    }

    if (current?.phase === 'start') {
      acceptAuthoritativeStart(current);
      return;
    }
    if (current?.phase === 'complete') {
      void finalizeResetInReceivingTab(current);
      return;
    }
    if (current?.phase === 'abort') {
      window.location.reload();
      return;
    }

    recoveryTimer = setTimeout(
      () => void reconcileAuthoritativeState(),
      STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const stopOwnedRecovery = () => {
    stopRecoveryHeartbeat?.();
    stopRecoveryHeartbeat = null;
    recoveringGeneration = null;
  };

  const retryOwnedRecovery = async (generation: string) => {
    if (recoveringGeneration !== generation) return;

    let stillOwned: boolean;
    try {
      stillOwned = await withStorageResetLock(() =>
        isOwnedStart(readCoordinationSignal(), generation),
      );
    } catch {
      scheduleOwnedRecoveryRetry(generation);
      return;
    }

    if (!stillOwned) {
      stopOwnedRecovery();
      void reconcileAuthoritativeState();
      return;
    }

    const cleaned = await performFinalCleanup();
    if (!cleaned) {
      scheduleOwnedRecoveryRetry(generation);
      return;
    }

    let completed: boolean;
    try {
      completed = await finishStorageResetCoordination(generation, 'complete');
    } catch {
      scheduleOwnedRecoveryRetry(generation);
      return;
    }

    if (completed) {
      stopOwnedRecovery();
      window.location.reload();
      return;
    }

    stopOwnedRecovery();
    void reconcileAuthoritativeState();
  };

  const recoverStaleReset = async (signal: StorageResetSignal) => {
    if (
      terminalGeneration === signal.generation ||
      recoveringGeneration === signal.generation
    ) {
      return;
    }

    let claim: ResetClaimResult;
    try {
      claim = await claimExpiredReset(signal);
    } catch {
      scheduleRecovery(signal, STORAGE_RESET_RECOVERY_RETRY_MS);
      return;
    }

    if (claim.status === 'fresh') {
      scheduleRecovery(claim.signal);
      return;
    }
    if (claim.status === 'superseded') {
      void reconcileAuthoritativeState();
      return;
    }

    recoveringGeneration = claim.signal.generation;
    stopRecoveryHeartbeat?.();
    stopRecoveryHeartbeat = startStorageResetLeaseHeartbeat(
      claim.signal.generation,
    );
    void retryOwnedRecovery(claim.signal.generation);
  };

  const retryTerminalFinalization = async (signal: StorageResetSignal) => {
    let current: StorageResetSignal | null;
    try {
      current = await readAuthoritativeSignalLocked();
    } catch {
      scheduleTerminalFinalizationRetry(signal);
      return;
    }

    if (current?.phase === 'start') {
      finalizingGeneration = null;
      acceptAuthoritativeStart(current);
      return;
    }
    if (current?.phase === 'complete') {
      finalizingGeneration = null;
      void finalizeResetInReceivingTab(current);
      return;
    }
    if (current?.phase === 'abort') {
      finalizingGeneration = null;
      window.location.reload();
      return;
    }

    scheduleTerminalFinalizationRetry(signal);
  };

  const finalizeResetInReceivingTab = async (signal: StorageResetSignal) => {
    if (finalizingGeneration === signal.generation) return;
    finalizingGeneration = signal.generation;
    quiesceStorageResetConnections();

    const cleaned = await performFinalCleanup();
    if (cleaned) {
      finalizingGeneration = null;
      window.location.reload();
      return;
    }

    finalizingGeneration = null;
    scheduleTerminalFinalizationRetry(signal);
  };

  const handleStartSignal = async (signal: StorageResetSignal) => {
    let authoritative: StorageResetSignal | null;
    try {
      authoritative = await withStorageResetLock(() => {
        const current = readCoordinationSignal();
        if (
          current?.phase !== 'start' ||
          current.generation !== signal.generation
        ) {
          return null;
        }
        // Quiesce while the transition lock is held. A terminal writer cannot
        // overtake this validation and leave the tab closed on a stale start.
        quiesceStorageResetConnections();
        return current;
      });
    } catch {
      return;
    }

    if (authoritative === null) return;
    terminalGeneration = null;
    scheduleRecovery(authoritative);
  };

  const handleTerminalSignal = async (signal: StorageResetSignal) => {
    let authoritative: StorageResetSignal | null;
    try {
      authoritative = await withStorageResetLock(() => {
        const current = readCoordinationSignal();
        if (
          current === null ||
          current.generation !== signal.generation ||
          current.phase !== signal.phase
        ) {
          return null;
        }
        if (current.phase === 'complete') quiesceStorageResetConnections();
        return current;
      });
    } catch {
      return;
    }

    if (authoritative === null) return;
    if (terminalGeneration === authoritative.generation) return;

    terminalGeneration = authoritative.generation;
    clearRecoveryTimer();
    stopOwnedRecovery();

    if (authoritative.phase === 'complete') {
      void finalizeResetInReceivingTab(authoritative);
      return;
    }

    window.location.reload();
  };

  const handleSignal = (signal: StorageResetSignal) => {
    if (signal.sourceTabId === STORAGE_RESET_TAB_ID) return;
    if (signal.phase === 'start') {
      void handleStartSignal(signal);
      return;
    }
    void handleTerminalSignal(signal);
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
      resetInProgress = true;
      quiesceStorageResetConnections();
      scheduleRecovery(current);
    }
  } catch {
    // A reset cannot be discovered when storage is inaccessible; normal startup
    // handles that degraded browser-storage environment.
  }

  return {
    resetInProgress,
    unregister: () => {
      clearRecoveryTimer();
      clearFinalizationTimer();
      stopOwnedRecovery();
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    },
  };
}
