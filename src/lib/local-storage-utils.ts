import * as v from 'valibot';

import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
import { useAuthStore } from '@/stores/auth-store';

const COMAPEO_PREFIX = 'comapeo-';

function getComapeoKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(COMAPEO_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

function removeComapeoKeys(): void {
  for (const key of getComapeoKeys()) {
    localStorage.removeItem(key);
  }
}

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

  // Clear existing comapeo-* keys first for atomic restore
  removeComapeoKeys();

  for (const [key, value] of Object.entries(result.output.data)) {
    if (key.startsWith(COMAPEO_PREFIX)) {
      localStorage.setItem(key, value);
    }
  }

  return { success: true };
}

export async function clearAllStorage(): Promise<void> {
  try {
    // Only clear comapeo-* prefixed keys, not all localStorage
    removeComapeoKeys();
    await resetDb();
    useAuthStore.getState().clearAll();
  } catch {
    // Swallow errors — reload below resets all state regardless
  } finally {
    window.location.reload();
  }
}
