import {
  closeCategoriesDbForStorageReset,
  resetCategoriesDbIsolated,
} from '@/lib/categories-db';
import { removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { closeDbForStorageReset, resetDbIsolated } from '@/lib/db';

export const STORAGE_RESET_COORDINATION_KEY =
  '__comapeo-storage-reset-coordination__';
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

/**
 * Publish reset-start before destructive database work. localStorage is required
 * here because it both notifies existing tabs and lets a tab opened mid-reset
 * discover that it must remain quiesced before rendering the application.
 */
export function beginStorageResetCoordination(): string {
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signal = createSignal(generation, 'start');
  localStorage.setItem(STORAGE_RESET_COORDINATION_KEY, JSON.stringify(signal));
  postBroadcastSignal(signal);
  return generation;
}

/** Publish a terminal reset phase. Returns false only when no transport worked. */
export function finishStorageResetCoordination(
  generation: string,
  phase: Exclude<StorageResetPhase, 'start'>,
): boolean {
  const signal = createSignal(generation, phase);
  let storagePublished = false;
  try {
    localStorage.setItem(
      STORAGE_RESET_COORDINATION_KEY,
      JSON.stringify(signal),
    );
    storagePublished = true;
  } catch {
    // BroadcastChannel can still release already-open tabs if localStorage
    // becomes unavailable after reset-start was successfully published.
  }
  const broadcastPublished = postBroadcastSignal(signal);
  return storagePublished || broadcastPublished;
}

export async function waitForStorageResetQuiescence(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, CROSS_TAB_QUIESCE_DELAY_MS);
  });
}

function quiesceThisTab(): void {
  closeDbForStorageReset();
  closeCategoriesDbForStorageReset();
}

async function finalizeResetInReceivingTab(): Promise<void> {
  // Keep the application's singleton connections closed while a fresh isolated
  // connection clears anything that might have committed after the initiator's
  // transaction. This also covers a tab that missed the start signal but still
  // receives the terminal signal.
  quiesceThisTab();
  try {
    await resetCategoriesDbIsolated();
    await resetDbIsolated();
    removeComapeoKeys({ bestEffort: true });
  } finally {
    window.location.reload();
  }
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

  const handleSignal = (signal: StorageResetSignal) => {
    // BroadcastChannel delivers to other channel objects in the same browsing
    // context too. Never let the initiating tab quiesce/finalize itself.
    if (signal.sourceTabId === STORAGE_RESET_TAB_ID) return;

    if (signal.phase === 'start') {
      if (activeGeneration === signal.generation) return;
      activeGeneration = signal.generation;
      terminalGeneration = null;
      quiesceThisTab();
      return;
    }

    if (terminalGeneration === signal.generation) return;
    terminalGeneration = signal.generation;

    if (signal.phase === 'complete') {
      void finalizeResetInReceivingTab();
      return;
    }

    // Abort means the primary database was not cleared. The tab only needs a
    // reload to reopen connections that were deliberately quiesced at start.
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
    const current = parseSignal(
      localStorage.getItem(STORAGE_RESET_COORDINATION_KEY),
    );
    if (current?.phase === 'start') {
      activeGeneration = current.generation;
      resetInProgress = true;
      quiesceThisTab();
    }
  } catch {
    // If storage itself is inaccessible, normal app startup handles that
    // degraded browser environment; there is no discoverable reset to join.
  }

  return {
    resetInProgress,
    unregister: () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    },
  };
}
