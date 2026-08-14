import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import {
  getComapeoKeys,
  removeComapeoKeys,
  signalComapeoStorageReset,
} from '@/lib/comapeo-local-storage';
import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
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

export type ImportLocalStorageError = 'invalid-format' | 'storage-unavailable';

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
      // A persistent browser-storage failure can also block compensation. The
      // operation still fails closed and the UI reports storage unavailability.
    }
    return {
      success: false,
      error: 'storage-unavailable',
    };
  }

  return { success: true };
}

export type ClearAllStorageFailureStep = 'categories-db' | 'app-db';

export class ClearAllStorageError extends Error {
  readonly partial: boolean;
  readonly failedStep: ClearAllStorageFailureStep;

  constructor(options: {
    failedStep: ClearAllStorageFailureStep;
    partial: boolean;
    cause: unknown;
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
  }
}

const RESET_FAILURE_RELOAD_DELAY_MS = 1500;

function clearRuntimeStateBestEffort(): void {
  try {
    useAuthStore.getState().clearAll();
  } catch {
    // Once a destructive database reset has succeeded, continue clearing every
    // remaining owned store rather than stopping in another partial state.
  }
  removeComapeoKeys({ bestEffort: true });
  signalComapeoStorageReset();
}

export async function clearAllStorage(): Promise<void> {
  // Clear the lower-value categories cache first. Its transaction is atomic; if
  // it fails, stop before touching the primary application database or prefs.
  try {
    await resetCategoriesDb();
  } catch (cause) {
    throw new ClearAllStorageError({
      failedStep: 'categories-db',
      partial: false,
      cause,
    });
  }

  try {
    await resetDb();
  } catch (cause) {
    // Categories are already cleared, so the reset is necessarily partial.
    // Finish every remaining cleanup step best-effort, coordinate other tabs,
    // and reload shortly after the UI has had a chance to explain the failure.
    clearRuntimeStateBestEffort();
    setTimeout(() => window.location.reload(), RESET_FAILURE_RELOAD_DELAY_MS);
    throw new ClearAllStorageError({
      failedStep: 'app-db',
      partial: true,
      cause,
    });
  }

  clearRuntimeStateBestEffort();
  window.location.reload();
}
