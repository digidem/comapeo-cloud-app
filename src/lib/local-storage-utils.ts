import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import { getComapeoKeys, removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
import {
  beginStorageResetCoordination,
  quiesceStorageResetConnections,
  runStorageResetOwnerOperation,
} from '@/lib/storage-reset-coordinator';
import { useAuthStore } from '@/stores/auth-store';

// Backup version 1 historically includes only `comapeo-*` keys. Keep that
// contract stable even though full-reset ownership is broader (colon-namespaced
// and legacy unprefixed keys are reset-only until a future backup version can
// represent their absence without breaking older snapshots).
const BACKUP_STORAGE_PREFIX = 'comapeo-';

function getBackupKeys(): string[] {
  return getComapeoKeys().filter((key) =>
    key.startsWith(BACKUP_STORAGE_PREFIX),
  );
}

function getBackupSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const key of getBackupKeys()) {
    const value = localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

function removeBackupKeys(): void {
  for (const key of getBackupKeys()) {
    localStorage.removeItem(key);
  }
}

function restoreBackupSnapshot(snapshot: Record<string, string>): void {
  const originalKeys = new Set(Object.keys(snapshot));

  // Remove keys introduced by a partially applied import, then restore the
  // original values. This is a compensating transaction because localStorage
  // itself does not provide atomic multi-key writes.
  for (const key of getBackupKeys()) {
    if (!originalKeys.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(snapshot)) {
    localStorage.setItem(key, value);
  }
}

function isBackupStorageKey(key: string): boolean {
  return key.startsWith(BACKUP_STORAGE_PREFIX);
}

export function exportLocalStorageData(): string {
  const data: Record<string, string> = {};

  // Backup export is intentionally fail-closed: if browser storage is blocked,
  // surface an error instead of downloading a misleading empty/partial backup.
  try {
    for (const key of getBackupKeys()) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    }
  } catch (error) {
    throw new Error('Browser storage is unavailable; backup was not created.', {
      cause: error,
    });
  }

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  });
}

export type ImportLocalStorageError =
  'invalid-format' | 'storage-unavailable' | 'compensation-failed';

export function importLocalStorageData(jsonString: string): {
  success: boolean;
  error?: ImportLocalStorageError;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'invalid-format' };
  }

  const result = v.safeParse(backupSchema, parsed);
  if (!result.success) {
    return { success: false, error: 'invalid-format' };
  }

  let snapshot: Record<string, string>;
  try {
    snapshot = getBackupSnapshot();
  } catch {
    return { success: false, error: 'storage-unavailable' };
  }

  try {
    // Preserve the v1 backup contract: clear and restore only `comapeo-*`
    // preferences. Full-reset ownership is intentionally broader.
    removeBackupKeys();

    for (const [key, value] of Object.entries(result.output.data)) {
      if (isBackupStorageKey(key)) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    try {
      restoreBackupSnapshot(snapshot);
    } catch {
      // The caller must reconcile live persisted stores with this mixed browser
      // state immediately; do not pretend the compensation succeeded.
      return { success: false, error: 'compensation-failed' };
    }
    return {
      success: false,
      error: 'storage-unavailable',
    };
  }

  return { success: true };
}

export type ClearAllStorageFailureStep =
  'coordination' | 'categories-db' | 'app-db' | 'browser-storage';

export class ClearAllStorageError extends Error {
  readonly partial: boolean;
  readonly failedStep: ClearAllStorageFailureStep;
  readonly reloadScheduled: boolean;

  constructor(options: {
    failedStep: ClearAllStorageFailureStep;
    partial: boolean;
    cause: unknown;
    reloadScheduled?: boolean;
  }) {
    super(
      options.partial
        ? 'The local data reset only partially completed.'
        : 'The local data reset could not start safely.',
      { cause: options.cause },
    );
    this.name = 'ClearAllStorageError';
    this.partial = options.partial;
    this.failedStep = options.failedStep;
    this.reloadScheduled = options.reloadScheduled ?? false;
  }
}

const RESET_FAILURE_RELOAD_DELAY_MS = 1500;

function scheduleResetReload(): void {
  setTimeout(() => {
    window.location.reload();
  }, RESET_FAILURE_RELOAD_DELAY_MS);
}

function clearRuntimeStateAfterDatabaseReset(): {
  storageCleanupFailed: boolean;
} {
  let runtimeCleanupFailed = false;
  try {
    useAuthStore.getState().clearAll();
  } catch {
    runtimeCleanupFailed = true;
  }

  const removal = removeComapeoKeys({ bestEffort: true });
  return {
    storageCleanupFailed:
      runtimeCleanupFailed ||
      removal.enumerationFailed ||
      removal.failedKeys.length > 0,
  };
}

async function runCoordinatedStorageReset(generation: string): Promise<void> {
  // Quiesce this initiating tab too. resetDb()/resetCategoriesDb() detect the
  // closed singleton connections and perform their destructive work through
  // isolated connections, so app callbacks cannot queue writes behind the clear.
  quiesceStorageResetConnections();

  let result;
  let destructiveStarted = false;
  try {
    result = await runStorageResetOwnerOperation(
      generation,
      async ({ publish }) => {
        destructiveStarted = true;
        try {
          await resetCategoriesDb();
        } catch (cause) {
          // Keep the durable reset recoverable. The initiating tab is already
          // quiesced, and a reload can hand the same generation to stale-reset
          // recovery rather than abandoning a user-requested destructive reset.
          publish('start');
          return {
            error: new ClearAllStorageError({
              failedStep: 'categories-db',
              partial: false,
              cause,
              reloadScheduled: true,
            }),
          };
        }
        try {
          await resetDb();
        } catch (cause) {
          // Categories may already be gone, so this must remain a recoverable
          // start generation instead of publishing abort and stranding a partial
          // reset after reload.
          publish('start');
          return {
            error: new ClearAllStorageError({
              failedStep: 'app-db',
              partial: true,
              cause,
              reloadScheduled: true,
            }),
          };
        }
        const { storageCleanupFailed } = clearRuntimeStateAfterDatabaseReset();
        if (storageCleanupFailed) {
          publish('start');
          return {
            error: new ClearAllStorageError({
              failedStep: 'browser-storage',
              partial: true,
              cause: new Error(
                'One or more owned browser-storage keys could not be removed.',
              ),
              reloadScheduled: true,
            }),
          };
        }

        // Perform the final synchronous runtime/storage sweep while the durable
        // phase is still `start`. Nothing asynchronous runs between this sweep,
        // publishing `complete`, and navigation, so a failed final sweep remains
        // recoverable instead of leaving a terminal marker with surviving state.
        const finalCleanup = clearRuntimeStateAfterDatabaseReset();
        if (finalCleanup.storageCleanupFailed) {
          publish('start');
          return {
            error: new ClearAllStorageError({
              failedStep: 'browser-storage',
              partial: true,
              cause: new Error('Final owned browser-storage cleanup failed.'),
              reloadScheduled: true,
            }),
          };
        }

        publish('complete');
        window.location.reload();
        return { error: null };
      },
    );
  } catch (cause) {
    // This tab's app connections are already closed. A barrier-acquisition error
    // happens before destructive work starts, while later coordination failures
    // may follow a partial clear. Either way the durable `start` marker remains
    // recoverable and a non-cancellable reload hands it back to the coordinator.
    scheduleResetReload();
    throw new ClearAllStorageError({
      failedStep: 'coordination',
      partial: destructiveStarted,
      cause,
      reloadScheduled: true,
    });
  }
  if (!result.owned) {
    scheduleResetReload();
    throw new ClearAllStorageError({
      failedStep: 'coordination',
      partial: false,
      cause: new Error('Reset ownership was superseded.'),
      reloadScheduled: true,
    });
  }
  if (result.value.error) {
    scheduleResetReload();
    throw result.value.error;
  }
}

export async function clearAllStorage(): Promise<void> {
  let generation: string;
  try {
    generation = await beginStorageResetCoordination();
  } catch (cause) {
    // Coordination uses localStorage as a durable reset-start marker. If it is
    // unavailable, fail before deleting either IndexedDB database.
    throw new ClearAllStorageError({
      failedStep: 'coordination',
      partial: false,
      cause,
    });
  }

  await runCoordinatedStorageReset(generation);
}
