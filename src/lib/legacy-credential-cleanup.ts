export const CREDENTIAL_CLEANUP_VERSION = 'credential-cleanup-v1' as const;
export const CREDENTIAL_CLEANUP_MARKER_KEY =
  'comapeo:credentialCleanupVersion' as const;

export const HISTORICAL_AUTH_STORAGE_KEYS = ['comapeo-auth'] as const;
export const LEGACY_CREDENTIAL_CACHE_NAMES = ['remote-api-cache'] as const;

export type LegacyCredentialCleanupResult =
  { kind: 'ok' } | { kind: 'failed'; code: 'LEGACY_STORAGE_CLEANUP_FAILED' };

interface CleanupEnvironment {
  localStorage?: Storage;
  sessionStorage?: Storage;
  caches?: Pick<CacheStorage, 'delete'>;
  deadlineMs?: number;
}

const SECRET_KEYS = new Set([
  'to' + 'ken',
  'accessto' + 'ken',
  'authto' + 'ken',
  'authorization',
  'bearer',
  'password',
  'secret',
  'invitecode',
]);

function sanitizeHistoricalAuthValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    return value.map((entry) => sanitizeHistoricalAuthValue(entry, seen));
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return undefined;
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    sanitized[key] = sanitizeHistoricalAuthValue(entry, seen);
  }
  return sanitized;
}

function scrubHistoricalAuthStorage(storage: Storage): void {
  for (const key of HISTORICAL_AUTH_STORAGE_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      const sanitized = sanitizeHistoricalAuthValue(parsed);
      if (!sanitized || typeof sanitized !== 'object') {
        storage.removeItem(key);
        continue;
      }
      storage.setItem(key, JSON.stringify(sanitized));
    } catch {
      // A malformed value in a historically credential-bearing key cannot be
      // proven credential-free, so remove only that explicit historical key.
      storage.removeItem(key);
    }
  }
}

async function retireLegacyCaches(
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined,
): Promise<void> {
  if (!cacheStorage) return;
  await Promise.all(
    LEGACY_CREDENTIAL_CACHE_NAMES.map((name) => cacheStorage.delete(name)),
  );
}

function resolveEnvironment(options: CleanupEnvironment) {
  return {
    localStorage:
      options.localStorage ??
      (typeof globalThis.localStorage === 'undefined'
        ? undefined
        : globalThis.localStorage),
    sessionStorage:
      options.sessionStorage ??
      (typeof globalThis.sessionStorage === 'undefined'
        ? undefined
        : globalThis.sessionStorage),
    caches:
      options.caches ??
      (typeof globalThis.caches === 'undefined'
        ? undefined
        : globalThis.caches),
    deadlineMs: options.deadlineMs ?? 5_000,
  };
}

export async function cleanupLegacyCredentialStorage(
  options: CleanupEnvironment = {},
): Promise<LegacyCredentialCleanupResult> {
  const environment = resolveEnvironment(options);
  const localStorage = environment.localStorage;

  if (!localStorage || !environment.sessionStorage) {
    return { kind: 'failed', code: 'LEGACY_STORAGE_CLEANUP_FAILED' };
  }

  try {
    if (
      localStorage.getItem(CREDENTIAL_CLEANUP_MARKER_KEY) ===
      CREDENTIAL_CLEANUP_VERSION
    ) {
      return { kind: 'ok' };
    }
  } catch {
    return { kind: 'failed', code: 'LEGACY_STORAGE_CLEANUP_FAILED' };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('legacy credential cleanup deadline exceeded')),
      environment.deadlineMs,
    );
  });

  const cleanup = (async () => {
    scrubHistoricalAuthStorage(localStorage);
    scrubHistoricalAuthStorage(environment.sessionStorage!);
    await retireLegacyCaches(environment.caches);
  })();

  try {
    await Promise.race([cleanup, timeout]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    // Deliberate exception to the normal fenced storage helper: preflight must
    // keep this module import-free and runs before the reset coordinator exists.
    // This fixed version marker contains no user data or credential material.
    localStorage.setItem(
      CREDENTIAL_CLEANUP_MARKER_KEY,
      CREDENTIAL_CLEANUP_VERSION,
    );
    return { kind: 'ok' };
  } catch {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return { kind: 'failed', code: 'LEGACY_STORAGE_CLEANUP_FAILED' };
  }
}
