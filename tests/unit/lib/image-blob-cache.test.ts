import { setupBlobUrlMocks } from '@tests/mocks/blob-url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createImageBlobCache } from '@/lib/image-blob-cache';

describe('image-blob-cache', () => {
  let revokeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mocks = setupBlobUrlMocks();
    revokeMock = mocks.revokeObjectUrlMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get returns undefined for unknown key', () => {
    const cache = createImageBlobCache();
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('set then get returns the entry', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    const entry = cache.get('key1');
    expect(entry).toBeDefined();
    expect(entry!.blobUrl).toBe('blob:mocked-url');
    expect(entry!.refCount).toBe(0);
    expect(entry!.serverToken).toBe('tok1');
    expect(entry!.serverSignature).toBe('sig1');
  });

  it('set initializes refCount to the value passed in', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
      refCount: 3,
    });
    expect(cache.get('key1')!.refCount).toBe(3);
  });

  it('ref increments refCount', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    cache.ref('key1');
    expect(cache.get('key1')!.refCount).toBe(1);
    cache.ref('key1');
    expect(cache.get('key1')!.refCount).toBe(2);
  });

  describe('with grace period (default 30s)', () => {
    it('unref decrements refCount to 0 and keeps entry in store during grace period', () => {
      const cache = createImageBlobCache();
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      const entry = cache.get('key1')!;
      expect(entry).toBeDefined();
      expect(entry.refCount).toBe(0);
      // Blob URL is NOT revoked immediately — only after the grace period elapses.
      expect(revokeMock).not.toHaveBeenCalled();
    });

    it('unref does not revoke when refCount is still > 0', () => {
      const cache = createImageBlobCache();
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 2,
      });
      cache.unref('key1');
      expect(cache.get('key1')!.refCount).toBe(1);
      expect(revokeMock).not.toHaveBeenCalled();
    });

    it('unref clamps refCount to 0', () => {
      const cache = createImageBlobCache();
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
      });
      // refCount is 0, unref should clamp to 0 (not go negative)
      cache.unref('key1');
      expect(cache.get('key1')!.refCount).toBe(0);
    });

    it('entry can be revived during the grace period via ref (cancels eviction)', () => {
      const cache = createImageBlobCache();
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      expect(cache.get('key1')!.refCount).toBe(0);

      // Revive the entry — this should cancel any pending eviction
      cache.ref('key1');
      expect(cache.get('key1')!.refCount).toBe(1);
      expect(revokeMock).not.toHaveBeenCalled();
    });
  });

  describe('with synchronous eviction (revokeAfterMs=0)', () => {
    it('unref to 0 evicts the entry synchronously and revokes the blob URL', () => {
      const cache = createImageBlobCache({ revokeAfterMs: 0 });
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      // With revokeAfterMs=0, the entry is evicted immediately on unref
      expect(cache.get('key1')).toBeUndefined();
      expect(revokeMock).toHaveBeenCalledWith('blob:mocked-url');
    });

    it('ref after synchronous eviction creates a new entry slot (cache miss)', () => {
      const cache = createImageBlobCache({ revokeAfterMs: 0 });
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      // Evicted — ref is a no-op
      cache.ref('key1');
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('with fake timers and custom grace period', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('evicts the entry after the grace period elapses with no new ref', () => {
      const cache = createImageBlobCache({ revokeAfterMs: 5_000 });
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      expect(cache.get('key1')).toBeDefined();
      expect(revokeMock).not.toHaveBeenCalled();

      // Advance past the grace period
      vi.advanceTimersByTime(5_001);

      expect(cache.get('key1')).toBeUndefined();
      expect(revokeMock).toHaveBeenCalledWith('blob:mocked-url');
    });

    it('cancels eviction when ref() is called before the grace period elapses', () => {
      const cache = createImageBlobCache({ revokeAfterMs: 5_000 });
      cache.set('key1', {
        blobUrl: 'blob:mocked-url',
        serverToken: 'tok1',
        serverSignature: 'sig1',
        refCount: 1,
      });
      cache.unref('key1');
      // Ref before the grace period elapses
      vi.advanceTimersByTime(2_000);
      cache.ref('key1');
      expect(cache.get('key1')!.refCount).toBe(1);

      // Past the original grace period — entry should still be there
      vi.advanceTimersByTime(5_000);
      expect(cache.get('key1')).toBeDefined();
      expect(revokeMock).not.toHaveBeenCalled();
    });
  });

  it('invalidate drops matching entries and revokes their blob URLs', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    cache.set('key2', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok2',
      serverSignature: 'sig2',
    });

    const count = cache.invalidate(
      (_key, entry) => entry.serverToken === 'tok1',
    );
    expect(count).toBe(1);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeDefined();
    expect(revokeMock).toHaveBeenCalledWith('blob:mocked-url');
  });

  it('invalidate returns 0 when nothing matches', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    const count = cache.invalidate(
      (_key, entry) => entry.serverToken === 'nonexistent',
    );
    expect(count).toBe(0);
    expect(cache.get('key1')).toBeDefined();
  });

  it('clear revokes all blob URLs and empties the map', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    cache.set('key2', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok2',
      serverSignature: 'sig2',
    });
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
    // Both blob URLs should be revoked
    expect(revokeMock).toHaveBeenCalledTimes(2);
  });

  it('size reflects current entry count', () => {
    const cache = createImageBlobCache();
    expect(cache.size()).toBe(0);
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    expect(cache.size()).toBe(1);
    cache.set('key2', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok2',
      serverSignature: 'sig2',
    });
    expect(cache.size()).toBe(2);
  });

  it('set overwrites existing entry', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
    });
    cache.set('key1', {
      blobUrl: 'blob:mocked-url-2',
      serverToken: 'tok1-updated',
      serverSignature: 'sig1-updated',
    });
    const entry = cache.get('key1')!;
    expect(entry.serverToken).toBe('tok1-updated');
    expect(entry.refCount).toBe(0);
    // Old blob URL should be revoked on overwrite
    expect(revokeMock).toHaveBeenCalledWith('blob:mocked-url');
  });

  it('two subscribers to the same key share one blob URL after set', () => {
    const cache = createImageBlobCache();
    cache.set('key1', {
      blobUrl: 'blob:mocked-url',
      serverToken: 'tok1',
      serverSignature: 'sig1',
      refCount: 2,
    });
    // Both subscribers can read the same entry
    const entry = cache.get('key1')!;
    expect(entry.blobUrl).toBe('blob:mocked-url');
    expect(entry.refCount).toBe(2);

    // First unref doesn't revoke
    cache.unref('key1');
    expect(cache.get('key1')!.refCount).toBe(1);
    expect(revokeMock).not.toHaveBeenCalled();

    // Second unref keeps entry with refCount 0 (and grace period starts)
    cache.unref('key1');
    expect(cache.get('key1')!.refCount).toBe(0);
    // Blob URL is NOT revoked immediately — only after the grace period elapses
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('inflight promise is stored and accessible', () => {
    const cache = createImageBlobCache();
    const fetchPromise = Promise.resolve(new Blob(['data']));
    cache.set('key1', {
      blobUrl: '',
      serverToken: 'tok1',
      serverSignature: 'sig1',
      inflight: fetchPromise,
    });
    const entry = cache.get('key1')!;
    expect(entry.inflight).toBe(fetchPromise);
  });

  it('unref on non-existent key is a no-op', () => {
    const cache = createImageBlobCache();
    // Should not throw
    cache.unref('nonexistent');
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('ref on non-existent key is a no-op', () => {
    const cache = createImageBlobCache();
    // Should not throw
    cache.ref('nonexistent');
  });
});
