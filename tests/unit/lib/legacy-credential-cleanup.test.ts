import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CREDENTIAL_CLEANUP_MARKER_KEY,
  CREDENTIAL_CLEANUP_VERSION,
  cleanupLegacyCredentialStorage,
} from '@/lib/legacy-credential-cleanup';

const CANARY = 'legacy-credential-canary-238';

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  readonly getItemSpy = vi.fn((key: string) => this.#data.get(key) ?? null);

  get length() {
    return this.#data.size;
  }

  clear(): void {
    this.#data.clear();
  }

  getItem(key: string): string | null {
    return this.getItemSpy(key);
  }

  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, value);
  }
}

function createCaches(overrides?: {
  delete?: (name: string) => Promise<boolean>;
}) {
  return {
    delete: vi.fn(overrides?.delete ?? (async () => true)),
  } as Pick<CacheStorage, 'delete'>;
}

describe('legacy credential cleanup', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('scrubs the verified historical comapeo-auth credential while preserving non-secret metadata', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const caches = createCaches();
    session.setItem(
      'comapeo-auth',
      JSON.stringify({ token: CANARY, baseUrl: 'https://archive.example.com' }),
    );
    local.setItem('comapeo:activeServerId', 'server-123');

    await expect(
      cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      }),
    ).resolves.toEqual({ kind: 'ok' });

    expect(session.getItem('comapeo-auth')).toBe(
      JSON.stringify({ baseUrl: 'https://archive.example.com' }),
    );
    expect(local.getItem('comapeo:activeServerId')).toBe('server-123');
    expect(
      JSON.stringify([...Array(session.length)].map((_, i) => session.key(i))),
    ).not.toContain(CANARY);
    expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBe(
      CREDENTIAL_CLEANUP_VERSION,
    );
  });

  it('removes malformed historical auth payloads rather than risking hidden residue', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    session.setItem('comapeo-auth', `{not-json:${CANARY}}`);

    await cleanupLegacyCredentialStorage({
      localStorage: local,
      sessionStorage: session,
      caches: createCaches(),
    });

    expect(session.getItem('comapeo-auth')).toBeNull();
  });

  it('retires the known credential-capable remote-api-cache', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const caches = createCaches();

    await cleanupLegacyCredentialStorage({
      localStorage: local,
      sessionStorage: session,
      caches,
    });

    expect(caches.delete).toHaveBeenCalledWith('remote-api-cache');
  });

  it('uses the current completion marker as a fast path without inspecting historical auth payloads or caches', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const caches = createCaches();
    local.setItem(CREDENTIAL_CLEANUP_MARKER_KEY, CREDENTIAL_CLEANUP_VERSION);
    session.setItem('comapeo-auth', JSON.stringify({ token: CANARY }));
    local.getItemSpy.mockClear();
    session.getItemSpy.mockClear();

    await expect(
      cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      }),
    ).resolves.toEqual({ kind: 'ok' });

    expect(local.getItemSpy).toHaveBeenCalledTimes(1);
    expect(local.getItemSpy).toHaveBeenCalledWith(
      CREDENTIAL_CLEANUP_MARKER_KEY,
    );
    expect(session.getItemSpy).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
  });

  it.each(['', 'old-version', 'malformed'])(
    'reruns cleanup for missing or stale marker %s',
    async (marker) => {
      const local = new MemoryStorage();
      const session = new MemoryStorage();
      const caches = createCaches();
      if (marker) local.setItem(CREDENTIAL_CLEANUP_MARKER_KEY, marker);

      await cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      });

      expect(caches.delete).toHaveBeenCalledWith('remote-api-cache');
      expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBe(
        CREDENTIAL_CLEANUP_VERSION,
      );
    },
  );

  it('is idempotent across concurrent cleanup calls', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const caches = createCaches();
    session.setItem('comapeo-auth', JSON.stringify({ token: CANARY }));

    const [first, second] = await Promise.all([
      cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      }),
      cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      }),
    ]);

    expect(first).toEqual({ kind: 'ok' });
    expect(second).toEqual({ kind: 'ok' });
    expect(session.getItem('comapeo-auth')).toBe(JSON.stringify({}));
    expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBe(
      CREDENTIAL_CLEANUP_VERSION,
    );
  });

  it('fails closed on cleanup rejection and never writes the completion marker', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const caches = createCaches({
      delete: async () => {
        throw new Error('cache unavailable');
      },
    });

    await expect(
      cleanupLegacyCredentialStorage({
        localStorage: local,
        sessionStorage: session,
        caches,
      }),
    ).resolves.toEqual({
      kind: 'failed',
      code: 'LEGACY_STORAGE_CLEANUP_FAILED',
    });
    expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBeNull();
  });

  it('fails closed after the absolute deadline and a late cleanup cannot write the marker', async () => {
    vi.useFakeTimers();
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    let finishDelete!: () => void;
    const caches = createCaches({
      delete: () =>
        new Promise<boolean>((resolve) => {
          finishDelete = () => resolve(true);
        }),
    });

    const cleanup = cleanupLegacyCredentialStorage({
      localStorage: local,
      sessionStorage: session,
      caches,
      deadlineMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(cleanup).resolves.toEqual({
      kind: 'failed',
      code: 'LEGACY_STORAGE_CLEANUP_FAILED',
    });
    expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBeNull();

    finishDelete();
    await vi.advanceTimersByTimeAsync(0);
    expect(local.getItem(CREDENTIAL_CLEANUP_MARKER_KEY)).toBeNull();
  });
});
