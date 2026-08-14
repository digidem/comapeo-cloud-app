const COMAPEO_PREFIXES = ['comapeo-', 'comapeo:'] as const;

export const VIEW_MODE_STORAGE_KEY = 'view-mode-preference';

// The current view-mode store predates the app-wide prefix convention. Keep the
// exception explicit so storage ownership remains narrow and unrelated keys stay safe.
const UNPREFIXED_COMAPEO_KEYS = new Set([VIEW_MODE_STORAGE_KEY]);

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
