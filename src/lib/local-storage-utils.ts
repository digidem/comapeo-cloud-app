import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import { getComapeoKeys, removeComapeoKeys } from '@/lib/comapeo-local-storage';
import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
import {
  beginStorageResetCoordination,
  finishStorageResetCoordination,
  quiesceStorageResetConnections,
  startStorageResetLeaseHeartbeat,
  waitForStorageResetQuiescence,
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

function scheduleResetReload(options?: {
  repeatStorageCleanup?: boolean;
}): void {
  setTimeout(() => {
    if (options?.repeatStorageCleanup) {
      // Persisted stores may have emitted during the warning interval. Remove
      // owned keys synchronously again immediately before navigation so no
      // successful stale write can survive the reload boundary.
      removeComapeoKeys({ bestEffort: true });
    }
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
  await waitForStorageResetQuiescence();

  // Clear the lower-value categories cache first. Its transaction is atomic; if
  // it fails, stop before touching the primary application database or prefs.
  try {
    await resetCategoriesDb();
  } catch (cause) {
    const abortPublished = await finishStorageResetCoordination(
      generation,
      'abort',
    );
    // This tab's app connections are already closed. Reload whether abort was
    // published or the lease must recover, so the current tab never continues
    // with unusable singleton connections.
    scheduleResetReload();
    throw new ClearAllStorageError({
      failedStep: abortPublished ? 'categories-db' : 'coordination',
      // If abort could not be persisted, the durable start lease remains and a
      // recovery tab may complete the requested reset after this error is shown.
      partial: !abortPublished,
      cause,
      reloadScheduled: true,
    });
  }

  try {
    await resetDb();
  } catch (cause) {
    // The primary transaction is atomic, so preserve auth and preferences when
    // it fails. Only the already-cleared categories cache is partial. Releasing
    // quiesced tabs and reloading is enough to restore a coherent app state.
    const abortPublished = await finishStorageResetCoordination(
      generation,
      'abort',
    );
    scheduleResetReload();
    throw new ClearAllStorageError({
      failedStep: abortPublished ? 'app-db' : 'coordination',
      partial: true,
      cause,
      reloadScheduled: true,
    });
  }

  const { storageCleanupFailed } = clearRuntimeStateAfterDatabaseReset();
  const coordinationCompleted = await finishStorageResetCoordination(
    generation,
    'complete',
  );

  if (storageCleanupFailed || !coordinationCompleted) {
    scheduleResetReload({
      repeatStorageCleanup: storageCleanupFailed && coordinationCompleted,
    });
    throw new ClearAllStorageError({
      failedStep: storageCleanupFailed ? 'browser-storage' : 'coordination',
      partial: true,
      reloadScheduled: true,
      cause: new Error(
        storageCleanupFailed
          ? 'One or more owned browser-storage keys could not be removed.'
          : 'Other open tabs could not be released from reset coordination.',
      ),
    });
  }

  window.location.reload();
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

  const stopStorageResetLeaseHeartbeat =
    startStorageResetLeaseHeartbeat(generation);
  try {
    await runCoordinatedStorageReset(generation);
  } finally {
    stopStorageResetLeaseHeartbeat();
  }
}
