import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import {
  getComapeoKeys,
  isComapeoStorageKey,
  removeComapeoKeys,
} from '@/lib/comapeo-local-storage';
import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
import { useAuthStore } from '@/stores/auth-store';

export function exportLocalStorageData(): string {
  const data: Record<string, string> = {};

  // Backup export is intentionally fail-closed: if browser storage is blocked,
  // surface an error instead of downloading a misleading empty/partial backup.
  try {
    for (const key of getComapeoKeys()) {
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

export function importLocalStorageData(jsonString: string): {
  success: boolean;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'Invalid backup file format' };
  }

  const result = v.safeParse(backupSchema, parsed);
  if (!result.success) {
    return { success: false, error: 'Invalid backup file format' };
  }

  try {
    // Clear existing CoMapeo-owned keys first, then restore only app-owned keys.
    removeComapeoKeys();

    for (const [key, value] of Object.entries(result.output.data)) {
      if (isComapeoStorageKey(key)) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    return {
      success: false,
      error: 'Browser storage is unavailable; backup was not imported.',
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
