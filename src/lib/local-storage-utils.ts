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

  for (const key of getComapeoKeys()) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
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

  // Clear existing CoMapeo-owned keys first for atomic restore.
  removeComapeoKeys();

  for (const [key, value] of Object.entries(result.output.data)) {
    if (isComapeoStorageKey(key)) {
      localStorage.setItem(key, value);
    }
  }

  return { success: true };
}

export async function clearAllStorage(): Promise<void> {
  // If either IndexedDB reset fails, leave browser preferences untouched rather
  // than creating a second, unrelated partial reset. The caller handles the
  // failure UX and reload policy.
  await resetDb();
  await resetCategoriesDb();
  useAuthStore.getState().clearAll();

  // Remove persisted browser preferences last so live stores have no await window
  // in which to re-write stale state before the reload.
  try {
    removeComapeoKeys();
  } catch {
    // Best effort: continue the reset and reload even if localStorage is inaccessible.
  }
  window.location.reload();
}
