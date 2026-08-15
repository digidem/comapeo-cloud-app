const COMAPEO_PREFIXES = ['comapeo-', 'comapeo:'] as const;

export const VIEW_MODE_STORAGE_KEY = 'view-mode-preference';

// The current view-mode store predates the app-wide prefix convention. Keep the
// exception explicit so storage ownership remains narrow and unrelated keys stay safe.
const UNPREFIXED_COMAPEO_KEYS = new Set([VIEW_MODE_STORAGE_KEY]);

let storageResetWritesBlocked = false;

export interface RemoveComapeoKeysResult {
  failedKeys: string[];
  enumerationFailed: boolean;
}

export function isComapeoStorageKey(key: string): boolean {
  return (
    COMAPEO_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    UNPREFIXED_COMAPEO_KEYS.has(key)
  );
}

export function blockComapeoStorageWritesForReset(): void {
  storageResetWritesBlocked = true;
}

export function allowComapeoStorageWritesAfterReset(): void {
  storageResetWritesBlocked = false;
}

export function areComapeoStorageWritesBlocked(): boolean {
  return storageResetWritesBlocked;
}

/**
 * Best-effort app-owned write used by mounted stores. Once reset starts, stale
 * callbacks may still run briefly; dropping their persistence is safer than
 * recreating data after the owner's final sweep.
 */
export function setComapeoStorageItem(key: string, value: string): boolean {
  if (storageResetWritesBlocked && isComapeoStorageKey(key)) return false;
  localStorage.setItem(key, value);
  return true;
}

/** Strict variant for explicit user flows such as backup import. */
export function setComapeoStorageItemOrThrow(key: string, value: string): void {
  if (!setComapeoStorageItem(key, value)) {
    throw new DOMException(
      'Local storage writes are blocked during data reset.',
      'InvalidStateError',
    );
  }
}

/**
 * Zustand-compatible storage. Hydration remains readable, but app-owned writes
 * become inert as soon as reset coordination blocks persistence in this tab.
 */
export const comapeoStateStorage = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    setComapeoStorageItem(key, value);
  },
  removeItem: (key: string): void => localStorage.removeItem(key),
};

export function getComapeoKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && isComapeoStorageKey(key)) {
      keys.push(key);
    }
  }
  return keys;
}

export function removeComapeoKeys(options?: {
  bestEffort?: boolean;
}): RemoveComapeoKeysResult {
  const bestEffort = options?.bestEffort ?? false;
  let keys: string[];

  try {
    keys = getComapeoKeys();
  } catch (error) {
    if (!bestEffort) throw error;
    return { failedKeys: [], enumerationFailed: true };
  }

  const failedKeys: string[] = [];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      if (!bestEffort) throw error;
      failedKeys.push(key);
    }
  }

  return { failedKeys, enumerationFailed: false };
}
