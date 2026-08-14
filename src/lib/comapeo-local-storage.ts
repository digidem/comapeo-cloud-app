const COMAPEO_PREFIXES = ['comapeo-', 'comapeo:'] as const;
// The current view-mode store predates the app-wide prefix convention. Keep the
// exception explicit so storage ownership remains narrow and unrelated keys stay safe.
const UNPREFIXED_COMAPEO_KEYS = new Set(['view-mode-preference']);

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

export function removeComapeoKeys(): void {
  for (const key of getComapeoKeys()) {
    localStorage.removeItem(key);
  }
}
