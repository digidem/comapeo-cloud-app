const COMAPEO_PREFIXES = ['comapeo-', 'comapeo:'] as const;

export const VIEW_MODE_STORAGE_KEY = 'view-mode-preference';

/**
 * Cross-tab coordination key. It is deliberately outside the app-owned key
 * prefixes because it is reset metadata, not a user preference that should be
 * removed during the reset that publishes it.
 */
export const COMAPEO_STORAGE_RESET_SIGNAL_KEY =
  '__comapeo-storage-reset-generation__';

// The current view-mode store predates the app-wide prefix convention. Keep the
// exception explicit so storage ownership remains narrow and unrelated keys stay safe.
const UNPREFIXED_COMAPEO_KEYS = new Set([VIEW_MODE_STORAGE_KEY]);

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

export function removeComapeoKeys(options?: { bestEffort?: boolean }): void {
  const bestEffort = options?.bestEffort ?? false;
  let keys: string[];

  try {
    keys = getComapeoKeys();
  } catch (error) {
    if (!bestEffort) throw error;
    return;
  }

  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      if (!bestEffort) throw error;
    }
  }
}

/**
 * Publish a reset generation so other open CoMapeo tabs can clear any stale
 * persisted state they may have written after the initiating tab's cleanup.
 * Failure is intentionally best-effort because blocked localStorage is already
 * handled as a degraded reset mode by the caller.
 */
export function signalComapeoStorageReset(): void {
  try {
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(COMAPEO_STORAGE_RESET_SIGNAL_KEY, generation);
  } catch {
    // Best effort: storage may be blocked by the browser.
  }
}

/**
 * Keep multiple open tabs from resurrecting reset preferences. A tab receiving
 * the reset generation synchronously removes app-owned keys again before it
 * reloads, covering writes that happened after the initiating tab's cleanup but
 * before this storage event was delivered.
 */
export function registerComapeoStorageResetListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorageReset = (event: StorageEvent) => {
    if (
      event.key !== COMAPEO_STORAGE_RESET_SIGNAL_KEY ||
      event.newValue === null ||
      (event.storageArea !== null && event.storageArea !== localStorage)
    ) {
      return;
    }

    removeComapeoKeys({ bestEffort: true });
    window.location.reload();
  };

  window.addEventListener('storage', handleStorageReset);
  return () => window.removeEventListener('storage', handleStorageReset);
}
