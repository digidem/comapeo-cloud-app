import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import { getComapeoKeys, removeComapeoKeys } from '@/lib/comapeo-local-storage';
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

function removeBackupKeys(): void {
  for (const key of getBackupKeys()) {
    localStorage.removeItem(key);
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
    return {
      success: false,
      error: 'storage-unavailable',
    };
  }

  return { success: true };
}

const RESET_FAILURE_RELOAD_DELAY_MS = 1500;

export async function clearAllStorage(): Promise<void> {
  try {
    // If an IndexedDB reset fails, leave browser preferences untouched rather
    // than creating a second, unrelated partial reset.
    await resetDb();
    await resetCategoriesDb();
    useAuthStore.getState().clearAll();

    // Remove persisted browser preferences last so live stores have no await window
    // in which to re-write stale state before the reload.
    try {
      removeComapeoKeys({ bestEffort: true });
    } catch {
      // Best effort: inaccessible localStorage cannot be enumerated by the app either.
    }
    window.location.reload();
  } catch (error) {
    // All callers share one failure policy: surface the rejection, then reload
    // shortly afterward so no potentially partial in-memory state survives.
    setTimeout(() => window.location.reload(), RESET_FAILURE_RELOAD_DELAY_MS);
    throw error;
  }
}
