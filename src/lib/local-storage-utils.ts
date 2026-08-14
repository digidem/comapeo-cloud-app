import * as v from 'valibot';

import { resetCategoriesDb } from '@/lib/categories-db';
import { resetDb } from '@/lib/db';
import { backupSchema } from '@/lib/schemas/backup-schema';
import { useAuthStore } from '@/stores/auth-store';

const COMAPEO_PREFIX = 'comapeo-';
// App-owned keys that predate or do not follow the current comapeo-* naming
// convention. Keep them explicit so cleanup remains safe for unrelated storage.
const ADDITIONAL_COMAPEO_KEYS = [
  'comapeo:activeServerId',
  'view-mode-preference',
] as const;

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

export function removeComapeoKeys(): void {
  for (const key of getComapeoKeys()) {
    localStorage.removeItem(key);
  }
  for (const key of ADDITIONAL_COMAPEO_KEYS) {
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

  // Clear existing CoMapeo-owned keys first for atomic restore.
  removeComapeoKeys();

  for (const [key, value] of Object.entries(result.output.data)) {
    if (key.startsWith(COMAPEO_PREFIX)) {
      localStorage.setItem(key, value);
    }
  }

  return { success: true };
}

export async function clearAllStorage(): Promise<void> {
  // Clear only CoMapeo-owned keys, never unrelated localStorage.
  removeComapeoKeys();
  await resetDb();
  await resetCategoriesDb();
  useAuthStore.getState().clearAll();
  window.location.reload();
}
