import {
  closeCategoriesDbForStorageReset,
  resetCategoriesDbIsolated,
} from '@/lib/categories-db';
import { removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { closeDbForStorageReset, resetDbIsolated } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

export const STORAGE_RESET_COORDINATION_KEY =
  '__comapeo-storage-reset-coordination-v1__';
export const STORAGE_RESET_LEASE_MS = 5_000;
export const STORAGE_RESET_ACTIVITY_LOCK_NAME =
  'comapeo-storage-reset-activity-v1';
const STORAGE_RESET_RECOVERY_RETRY_MS = 1_000;
const STORAGE_RESET_CHANNEL_NAME = 'comapeo-storage-reset';
const STORAGE_RESET_LOCK_NAME = 'comapeo-storage-reset-v1';
const STORAGE_RESET_TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let releaseActivityLock: (() => void) | null = null;
let activityLockReadyPromise: Promise<void> | null = null;

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

function requestStorageResetActivityLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return Promise.resolve();
  }
  if (activityLockReadyPromise) return activityLockReadyPromise;

  let resolveHold!: () => void;
  const hold = new Promise<void>((resolve) => {
    resolveHold = resolve;
  });
  let resolveReady!: () => void;
  let rejectReady!: (cause: unknown) => void;
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  activityLockReadyPromise = ready;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (releaseActivityLock === release) releaseActivityLock = null;
    resolveHold();
  };
  releaseActivityLock = release;

  void navigator.locks
    .request(STORAGE_RESET_ACTIVITY_LOCK_NAME, { mode: 'shared' }, async () => {
      if (!readySettled) {
        readySettled = true;
        resolveReady();
      }
      await hold;
    })
    .catch((cause: unknown) => {
      if (!readySettled) {
        readySettled = true;
        rejectReady(cause);
      }
      closeStorageResetConnections();
    })
    .finally(() => {
      if (activityLockReadyPromise === ready) activityLockReadyPromise = null;
      if (releaseActivityLock === release) releaseActivityLock = null;
      resolveHold();
    });

  return ready;
}

async function waitForStorageResetActivityLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return;

  for (;;) {
    try {
      await requestStorageResetActivityLock();
      return;
    } catch {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, STORAGE_RESET_RECOVERY_RETRY_MS);
      });
    }
  }
}

function releaseStorageResetActivityLock(): void {
  releaseActivityLock?.();
}

async function withStorageResetActivityBarrier<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('Cross-tab reset locking is unavailable in this browser.');
  }
  return navigator.locks.request(
    STORAGE_RESET_ACTIVITY_LOCK_NAME,
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

export interface StorageResetOwnerContext {
  publish(phase: StorageResetPhase): void;
}

/**
 * Run owner work while retaining the generation-transition lock. Ownership is
 * checked before the callback, and every publication is synchronous, so a
 * takeover/new generation can neither overlap destructive work nor slip in
 * between its final sweep and navigation.
 */
export async function runStorageResetOwnerOperation<T>(
  generation: string,
  operation: (context: StorageResetOwnerContext) => T | Promise<T>,
): Promise<{ owned: false } | { owned: true; value: T }> {
  // Hold the exclusive activity barrier for the entire destructive operation.
  // Existing tabs must release their shared locks before this starts, and newly
  // opened tabs queue behind the barrier until cleanup + terminal publication
  // have finished, so there is no post-barrier write window.
  return withStorageResetActivityBarrier(() =>
    withStorageResetLock(async () => {
      if (!isOwnedStart(readCoordinationSignal(), generation)) {
        return { owned: false };
      }
      const value = await operation({
        publish(phase) {
          const signal = createSignal(generation, phase);
          if (!persistSignal(signal)) {
            throw new Error(`Could not persist reset ${phase} state.`);
          }
          postBroadcastSignal(signal);
        },
      });
      return { owned: true, value };
    }),
  );
}

function closeStorageResetConnections(): void {
  closeDbForStorageReset();
  closeCategoriesDbForStorageReset();
}

export function quiesceStorageResetConnections(): void {
  closeStorageResetConnections();
  releaseStorageResetActivityLock();
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

  let runtimeCleared = true;
  try {
    useAuthStore.getState().clearAll();
  } catch {
    runtimeCleared = false;
  }

  const removal = removeComapeoKeys({ bestEffort: true });
  const preferencesCleared =
    !removal.enumerationFailed && removal.failedKeys.length === 0;

  return (
    categoriesCleared && primaryCleared && runtimeCleared && preferencesCleared
  );
}

async function recoverExpiredResetLocked(
  expected: StorageResetSignal,
): Promise<ResetClaimResult> {
  // Do not hold the generation-transition lock while waiting for active tabs:
  // those tabs need that lock to validate start and quiesce. Once every mounted
  // tab has released its shared activity lock, claim + cleanup + terminal publish
  // run atomically under the transition lock.
  return withStorageResetActivityBarrier(() =>
    withStorageResetLock(async () => {
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
      const cleaned = await performFinalCleanup();
      if (cleaned) {
        const complete = createSignal(claimed.generation, 'complete');
        if (!persistSignal(complete)) {
          throw new Error('Could not persist reset recovery completion.');
        }
        postBroadcastSignal(complete);
        window.location.reload();
        return { status: 'claimed', signal: complete };
      }

      const renewed = createSignal(claimed.generation, 'start');
      if (!persistSignal(renewed)) {
        throw new Error('Could not renew failed reset recovery.');
      }
      postBroadcastSignal(renewed);
      return { status: 'claimed', signal: renewed };
    }),
  );
}

async function readAuthoritativeSignalLocked(): Promise<StorageResetSignal | null> {
  return withStorageResetLock(() => readCoordinationSignal());
}

export async function registerStorageResetCoordinator(): Promise<{
  unregister: () => void;
  resetInProgress: boolean;
}> {
  if (typeof window === 'undefined') {
    return { unregister: () => {}, resetInProgress: false };
  }

  // Queue the tab's lifetime shared lock immediately, before any asynchronous
  // work. The app is not allowed to mount until acquisition is confirmed. If a
  // reset already holds or is waiting for the exclusive barrier, this readiness
  // promise stays pending until the destructive generation is safely finished.
  const activityReady = waitForStorageResetActivityLock();

  let terminalGeneration: string | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let finalizationTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveringGeneration: string | null = null;
  let finalizingGeneration: string | null = null;

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
      if (terminalGeneration === current.generation) return;
      terminalGeneration = current.generation;
      void finalizeResetInReceivingTab(current);
      return;
    }
    if (current?.phase === 'abort') {
      if (terminalGeneration === current.generation) return;
      terminalGeneration = current.generation;
      window.location.reload();
      return;
    }
    if (current === null) {
      // This path is only entered while reconciling a previously observed reset.
      // If the durable marker disappeared, reload to reopen quiesced connections.
      window.location.reload();
      return;
    }

    recoveryTimer = setTimeout(
      () => void reconcileAuthoritativeState(),
      STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  };

  const stopOwnedRecovery = () => {
    recoveringGeneration = null;
  };

  const retryOwnedRecovery = async (generation: string) => {
    if (recoveringGeneration !== generation) return;

    try {
      const current = await readAuthoritativeSignalLocked();
      if (current?.phase === 'start') {
        recoveringGeneration = null;
        scheduleRecovery(current, 0);
      } else {
        recoveringGeneration = null;
        void reconcileAuthoritativeState();
      }
    } catch {
      scheduleOwnedRecoveryRetry(generation);
    }
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
      claim = await recoverExpiredResetLocked(signal);
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

    if (claim.status === 'claimed' && claim.signal.phase === 'start') {
      recoveringGeneration = claim.signal.generation;
      scheduleOwnedRecoveryRetry(claim.signal.generation);
    }
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
    if (current === null) {
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

    let reloaded = false;
    try {
      reloaded = await withStorageResetLock(() => {
        const current = readCoordinationSignal();
        if (
          current?.phase !== 'complete' ||
          current.generation !== signal.generation
        ) {
          return false;
        }

        // All destructive cleanup must finish before `complete` is published by
        // the owner. A delayed receiver may have missed the start signal and can
        // resume long after users have created fresh post-reset data, so it must
        // never perform a late global sweep. Quiesce and reload only.
        window.location.reload();
        return true;
      });
    } catch {
      /* retry authoritative complete */
    }
    if (reloaded) {
      finalizingGeneration = null;
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
      // Close storage immediately, but keep this tab's shared activity lock until
      // authoritative reconciliation confirms start. Otherwise the reset owner
      // could cross the barrier while this still-mounted tab is indeterminate and
      // capable of issuing non-database persisted writes.
      closeStorageResetConnections();
      clearRecoveryTimer();
      recoveryTimer = setTimeout(
        () => void reconcileAuthoritativeState(),
        STORAGE_RESET_RECOVERY_RETRY_MS,
      );
      return;
    }

    if (authoritative === null) {
      void reconcileAuthoritativeState();
      return;
    }
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
      quiesceStorageResetConnections();
      scheduleTerminalFinalizationRetry(signal);
      return;
    }

    if (authoritative === null) {
      void reconcileAuthoritativeState();
      return;
    }
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

  // Do not expose mount readiness until this tab is actually participating in
  // the shared activity barrier. Transient lock acquisition failures are retried
  // internally while the app remains unmounted.
  await activityReady;

  let resetInProgress = false;
  try {
    const current = readCoordinationSignal();
    if (current?.phase === 'start') {
      resetInProgress = true;
      quiesceStorageResetConnections();
      scheduleRecovery(current);
    }
  } catch {
    // Fail closed when startup cannot determine reset state. A tab opened during
    // an active reset must not mount the app and reopen its database connections
    // merely because one coordination read failed transiently. Keep it quiesced
    // and retry authoritative state until we can safely reload or resume recovery.
    resetInProgress = true;
    quiesceStorageResetConnections();
    clearRecoveryTimer();
    recoveryTimer = setTimeout(
      () => void reconcileAuthoritativeState(),
      STORAGE_RESET_RECOVERY_RETRY_MS,
    );
  }

  return {
    resetInProgress,
    unregister: () => {
      clearRecoveryTimer();
      clearFinalizationTimer();
      stopOwnedRecovery();
      releaseStorageResetActivityLock();
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    },
  };
}
