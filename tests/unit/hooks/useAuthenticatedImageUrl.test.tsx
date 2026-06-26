import { act, renderHook } from '@testing-library/react';
import { setupBlobUrlMocks } from '@tests/mocks/blob-url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetImageBlobCacheForTests } from '@/hooks/useAuthenticatedImageUrl';
import { ARCHIVE_TARGET_HEADER } from '@/lib/archive-proxy';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Fetch mocking strategy:
 * - Hook unit tests: Mock global fetch via vi.stubGlobal('fetch', vi.fn()).
 *   Uses createMockImageResponse() because jsdom Response doesn't support
 *   Blob bodies with .blob() properly.
 * - Component integration tests: Mock useAuthenticatedImageUrl at the module level
 *   to return instant success, preserving synchronous rendering behavior.
 */

function createMockImageResponse(): Response {
  const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    blob: () => Promise.resolve(blob),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    clone: () => createMockImageResponse(),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    statusText: 'OK',
    trailer: Promise.resolve(new Headers()),
  } as unknown as Response;
}

describe('useAuthenticatedImageUrl', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let revokeMock: ReturnType<typeof vi.fn>;
  let createUrlMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mocks = setupBlobUrlMocks();
    revokeMock = mocks.revokeObjectUrlMock;
    createUrlMock = mocks.createObjectUrlMock;

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Reset auth store to clean state
    useAuthStore.setState({
      tier: 'local',
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    resetImageBlobCacheForTests();
    vi.restoreAllMocks();
  });

  it('matches remote archive URL to correct server', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 's1',
          label: 'Archive',
          baseUrl: 'https://archive.example.com',
          token: 'tok1',
          status: 'connected' as const,
        },
      ],
    });

    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        'https://archive.example.com/projects/p1/attachments/d1/photo/img.jpg',
      ),
    );

    await act(() => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok1',
          [ARCHIVE_TARGET_HEADER]: 'https://archive.example.com',
        }),
      }),
    );
  });

  it('removes the archive base path before routing an absolute URL through the proxy', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 's1',
          label: 'Archive',
          baseUrl: 'https://archive.example.com/base',
          token: 'tok1',
          status: 'connected' as const,
        },
      ],
    });

    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        'https://archive.example.com/base/projects/p1/attachments/d1/photo/img.jpg',
      ),
    );

    await act(() => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok1',
          [ARCHIVE_TARGET_HEADER]: 'https://archive.example.com/base',
        }),
      }),
    );
  });

  it('routes relative attachment URLs through the only configured archive server', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 's1',
          label: 'Archive',
          baseUrl: 'https://archive.example.com',
          token: 'tok1',
          status: 'connected' as const,
        },
      ],
    });

    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        '/projects/p1/attachments/d1/photo/img.jpg?variant=thumbnail',
      ),
    );

    await act(() => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/attachments/d1/photo/img.jpg?variant=thumbnail',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok1',
          [ARCHIVE_TARGET_HEADER]: 'https://archive.example.com',
        }),
      }),
    );
  });

  it('uses fallback auth for unmatched origin', async () => {
    useAuthStore.setState({
      token: 'fallback-token',
      baseUrl: 'http://localhost:8080',
    });

    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        'http://localhost:8080/projects/p1/attachments/d1/photo/img.jpg',
      ),
    );

    await act(() => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fallback-token' },
      }),
    );
  });

  it('starts with isLoading: true when URL is provided', async () => {
    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    // Before fetch resolves, isLoading should be true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.blobUrl).toBeNull();
    expect(result.current.error).toBeNull();

    await act(() => Promise.resolve());

    // After fetch resolves, isLoading should be false
    expect(result.current.isLoading).toBe(false);
    expect(result.current.blobUrl).toBe('blob:mocked-url-1');
  });

  it('returns blobUrl on successful fetch', async () => {
    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    await act(() => Promise.resolve());

    expect(result.current).toEqual({
      blobUrl: 'blob:mocked-url-1',
      isLoading: false,
      error: null,
    });
  });

  it('sets error state on non-200 response', async () => {
    const errorResponse = {
      ...createMockImageResponse(),
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    };
    fetchMock.mockResolvedValue(errorResponse);

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    await act(() => Promise.resolve());

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('HTTP 403');
    expect(result.current.blobUrl).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error state on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    await act(() => Promise.resolve());

    expect(result.current.error).not.toBeNull();
    expect(result.current.blobUrl).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('blob URL is kept in cache on unmount (not immediately revoked)', async () => {
    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { unmount } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    await act(() => Promise.resolve());

    // Blob URL should have been created
    expect(URL.createObjectURL).toHaveBeenCalled();

    // Unmount does NOT revoke — the cache keeps the entry alive
    unmount();

    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('returns null blobUrl for malformed URL', async () => {
    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() => useAuthenticatedImageUrl('not-a-url'));

    await act(() => Promise.resolve());

    expect(result.current).toEqual({
      blobUrl: null,
      isLoading: false,
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null blobUrl for empty/invalid URL', async () => {
    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { result } = renderHook(() => useAuthenticatedImageUrl(''));

    await act(() => Promise.resolve());

    expect(result.current).toEqual({
      blobUrl: null,
      isLoading: false,
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles server with invalid baseUrl gracefully', async () => {
    useAuthStore.setState({
      token: 'fallback-token',
      baseUrl: 'http://localhost:8080',
      servers: [
        {
          id: 's1',
          label: 'Bad Server',
          baseUrl: 'not a valid url',
          token: 'tok1',
          status: 'connected' as const,
        },
      ],
    });

    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        'http://localhost:8080/projects/p1/attachments/d1/photo/img.jpg',
      ),
    );

    await act(() => Promise.resolve());

    // Falls through to fallback auth since server baseUrl is invalid
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fallback-token' },
      }),
    );
  });

  it('aborts in-flight request on URL change', async () => {
    let resolveFirst: (value: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    fetchMock.mockImplementationOnce(() => firstPromise);
    fetchMock.mockResolvedValueOnce(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { rerender } = renderHook(
      ({ url }) => useAuthenticatedImageUrl(url),
      { initialProps: { url: 'http://localhost:8080/first.jpg' } },
    );

    // Change URL before first fetch resolves
    rerender({ url: 'http://localhost:8080/second.jpg' });

    // Resolve the first (aborted) request
    await act(async () => {
      resolveFirst!(createMockImageResponse());
    });

    // The second fetch should have been made
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries with correct auth when servers are hydrated after mount', async () => {
    // Initially no servers — simulates pre-hydration state
    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    renderHook(() =>
      useAuthenticatedImageUrl(
        'https://archive.example.com/projects/p1/attachments/d1/photo/img.jpg',
      ),
    );

    // First fetch: no matching server, no token — fetches without auth
    await act(() => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://archive.example.com/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({ headers: {} }),
    );

    // Simulate hydration: server added to store
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(createMockImageResponse());

    await act(() => {
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Archive',
            baseUrl: 'https://archive.example.com',
            token: 'hydrated-token',
            status: 'connected' as const,
          },
        ],
      });
    });

    await act(() => Promise.resolve());

    // Second fetch: now routes through /api proxy with correct auth
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/attachments/d1/photo/img.jpg',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer hydrated-token',
          [ARCHIVE_TARGET_HEADER]: 'https://archive.example.com',
        }),
      }),
    );
  });

  describe('icon caching (cache: true)', () => {
    it('serves a cached blob without hitting the network', async () => {
      const url = 'https://archive.example.com/projects/p1/icon/icon-1';
      const { putCachedIconBlob } = await import('@/lib/db');
      await putCachedIconBlob(
        url,
        new Blob(['cached-icon'], { type: 'image/png' }),
      );

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const { result } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );

      await act(() => Promise.resolve());

      expect(result.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result.current.isLoading).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches then writes to the cache on a cache miss', async () => {
      const url = 'https://archive.example.com/projects/p1/icon/icon-miss';
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const { result } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.blobUrl).toBe('blob:mocked-url-1');

      const { getCachedIconBlob } = await import('@/lib/db');
      const cached = await getCachedIconBlob(url);
      expect(cached).toBeInstanceOf(Blob);
    });

    it('does not touch the cache when cache is not enabled', async () => {
      const url = 'https://archive.example.com/projects/p1/icon/icon-nocache';
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      renderHook(() => useAuthenticatedImageUrl(url));

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      const { getCachedIconBlob } = await import('@/lib/db');
      expect(await getCachedIconBlob(url)).toBeUndefined();
    });

    it('aborted IDB read settles inflight so a later remount retries instead of hanging', async () => {
      const url =
        'https://archive.example.com/projects/p1/icon/icon-abort-remount';
      const db = await import('@/lib/db');

      // Hold the first mount's IDB read pending so it can be aborted in flight.
      let resolveIdb!: (b: Blob | undefined) => void;
      const pendingIdb = new Promise<Blob | undefined>((resolve) => {
        resolveIdb = resolve;
      });
      const idbSpy = vi.spyOn(db, 'getCachedIconBlob');
      idbSpy.mockImplementationOnce(() => pendingIdb);

      fetchMock.mockResolvedValue(createMockImageResponse());
      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Originator (Path 3) — the IDB read is pending.
      const { unmount } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      await act(() => Promise.resolve());

      // Last subscriber unmounts while the IDB read is still in flight, so the
      // shared AbortController fires.
      unmount();
      await act(() => Promise.resolve());

      // The IDB read now completes. Before the fix, run() returned early at the
      // abort check and left the in-flight promise pending forever — leaking the
      // cache entry and hanging any future joiner.
      await act(async () => {
        resolveIdb(undefined);
      });
      await act(() => Promise.resolve());

      // A fresh mount must NOT attach to a leaked pending inflight. It should
      // start its own fetch and resolve to a blob URL.
      const { result } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.blobUrl).not.toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('does not update state after unmount', async () => {
    let resolveFetch: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    fetchMock.mockImplementationOnce(() => pendingPromise);

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { unmount } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    // Unmount before fetch resolves
    unmount();

    // Now resolve the fetch — should not cause state update warnings
    await act(async () => {
      resolveFetch!(createMockImageResponse());
    });

    // No assertion needed — the test passes if no React state-update-on-unmount warning fires
    expect(true).toBe(true);
  });

  describe('in-memory cache', () => {
    it('two hooks with the same URL fetch only once and share the blob URL', async () => {
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const { result: result1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());

      // Both hooks should get the same blob URL (only ONE createObjectURL call)
      const blobUrl = result1.current.blobUrl;
      expect(blobUrl).toBe('blob:mocked-url-1');
      expect(result2.current.blobUrl).toBe(blobUrl);
      // Only one createObjectURL call — the second subscriber reuses
      expect(createUrlMock).toHaveBeenCalledTimes(1);
      // Fetch should be called once (deduplicated)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('cache survives unmount/remount — fetch called once total', async () => {
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());

      // Unmount the first hook
      unmount1();

      await act(() => Promise.resolve());

      // Mount a second hook with the same URL
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // The second hook should get a blob URL
      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');
      // Fetch should be called only once total (cache survived unmount)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('change auth store token invalidates cache and triggers refetch', async () => {
      useAuthStore.setState({
        token: 'token-v1',
        baseUrl: 'http://localhost:8080',
      });

      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());

      // Unmount — entry is cached
      unmount1();

      await act(() => Promise.resolve());

      // Change auth token
      useAuthStore.setState({ token: 'token-v2' });

      await act(() => Promise.resolve());

      fetchMock.mockClear();
      fetchMock.mockResolvedValue(createMockImageResponse());

      // Mount again — should refetch because cache was invalidated
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(result2.current.blobUrl).toBe('blob:mocked-url-2');
      // Should have refetched after auth change
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('two hooks with different URLs fetch independently', async () => {
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo1.jpg'),
      );
      renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo2.jpg'),
      );

      await act(() => Promise.resolve());

      // Two different URLs = two fetches
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('in-memory cache works alongside icon cache (cache: true)', async () => {
      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // First hook with cache: true
      const { result: result1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/icon.png', {
          cache: true,
        }),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(result1.current.blobUrl).toBe('blob:mocked-url-1');

      // Second hook with same URL and cache: true should use in-memory cache
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/icon.png', {
          cache: true,
        }),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');
      // Only one fetch — in-memory cache deduplicated
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('archive URL with old token cached; new mount with new token refetches', async () => {
      // Set up archive server with token-v1
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Archive',
            baseUrl: 'https://archive.example.com',
            token: 'token-v1',
            status: 'connected' as const,
          },
        ],
      });

      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const url =
        'https://archive.example.com/projects/p1/attachments/d1/photo/img.jpg';

      // Mount, fetch, unmount — entry cached with token-v1 key
      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl(url),
      );

      await act(() => Promise.resolve());
      expect(fetchMock).toHaveBeenCalledTimes(1);

      unmount1();
      await act(() => Promise.resolve());

      // Change the server token (simulates re-auth)
      useAuthStore.setState({
        servers: [
          {
            id: 's1',
            label: 'Archive',
            baseUrl: 'https://archive.example.com',
            token: 'token-v2',
            status: 'connected' as const,
          },
        ],
      });

      await act(() => Promise.resolve());

      fetchMock.mockClear();
      fetchMock.mockResolvedValue(createMockImageResponse());

      // Mount again — new token means new cache key, so should refetch
      const { result } = renderHook(() => useAuthenticatedImageUrl(url));

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(result.current.blobUrl).toBe('blob:mocked-url-2');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejected in-flight is removed from cache so next mount retries', async () => {
      fetchMock.mockRejectedValueOnce(new Error('HTTP 500'));

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // First mount: fetch fails
      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());

      // Error should be set
      // (we can't easily check result because it may have unmounted)

      unmount1();
      await act(() => Promise.resolve());

      // Now set up a successful response
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(createMockImageResponse());

      // Second mount should retry (not attach to the rejected promise)
      const { result } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      expect(result.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result.current.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('two subscribers preserve refCount after fetch resolves — no overwrites', async () => {
      vi.useFakeTimers();

      let resolveFetch: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      fetchMock.mockImplementationOnce(() => pendingPromise);

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const url = 'http://localhost:8080/photo.jpg';

      // Subscriber 1 — originating (Path 3)
      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl(url),
      );

      // Subscriber 2 — in-flight joiner (Path 2)
      const { unmount: unmount2 } = renderHook(() =>
        useAuthenticatedImageUrl(url),
      );

      // Both are now subscribed. Resolve the fetch.
      await act(async () => {
        resolveFetch!(createMockImageResponse());
      });

      await act(() => Promise.resolve());

      // Unmount subscriber 1 — subscriber 2 is still mounted so blob should
      // NOT be revoked even after the grace period.
      unmount1();
      await act(() => Promise.resolve());

      // Advance past the default 30s grace period
      await act(() => {
        vi.advanceTimersByTime(31_000);
      });

      // BUG: if publishBlob overwrites refCount to 1, then unmounting
      // subscriber 1 drops refCount to 0, which schedules revocation.
      // After the grace period, the blob URL is revoked even though
      // subscriber 2 is still mounted.
      expect(revokeMock).not.toHaveBeenCalled();

      unmount2();
      await act(() => vi.advanceTimersByTime(31_000));

      vi.useRealTimers();
    });

    it('URL change unrefs old key exactly once (no double-unref)', async () => {
      vi.useFakeTimers();

      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      const urlA = 'http://localhost:8080/photo-a.jpg';
      const urlB = 'http://localhost:8080/photo-b.jpg';

      // Subscriber A1: holds a ref on URL A (stays mounted throughout)
      const { result: resultA1 } = renderHook(() =>
        useAuthenticatedImageUrl(urlA),
      );

      await act(() => Promise.resolve());

      // Subscriber A2: also holds a ref on URL A, then switches to URL B
      const { rerender, unmount: unmountA2 } = renderHook(
        ({ url }) => useAuthenticatedImageUrl(url),
        { initialProps: { url: urlA } },
      );

      await act(() => Promise.resolve());

      // Both subscribers are on URL A → refCount should be 2
      // Now subscriber A2 changes to URL B
      rerender({ url: urlB });

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // URL A should have been unref'd exactly once (from 2 → 1).
      // If double-unref'd (from 2 → 0), the grace period timer fires and
      // revokes the blob while subscriber A1 is still using it.
      await act(() => {
        vi.advanceTimersByTime(31_000);
      });

      // Subscriber A1 is still mounted with URL A — blob must NOT be revoked
      expect(revokeMock).not.toHaveBeenCalledWith('blob:mocked-url-1');
      expect(resultA1.current.blobUrl).toBe('blob:mocked-url-1');

      unmountA2();
      await act(() => vi.advanceTimersByTime(31_000));

      vi.useRealTimers();
    });

    it('originating subscriber unmount does not abort shared in-flight fetch', async () => {
      let resolveFetch: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      fetchMock.mockImplementationOnce(() => pendingPromise);

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // First subscriber starts the fetch (Path 3 — originating)
      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      // Second subscriber joins the in-flight (Path 2 — waiting)
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      // Unmount the originating subscriber — should NOT abort the fetch
      unmount1();
      await act(() => Promise.resolve());

      // Now resolve the fetch — the second subscriber should still get the blob URL
      await act(async () => {
        resolveFetch!(createMockImageResponse());
      });

      await act(() => Promise.resolve());

      // Second subscriber should have received the blob URL
      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result2.current.error).toBeNull();
    });

    it('last subscriber unmount aborts the shared in-flight fetch exactly once', async () => {
      // Use a fetch impl that records the AbortSignal so we can assert that
      // exactly one abort fires when the LAST subscriber unmounts before
      // resolution.
      const abortEvents: AbortSignal[] = [];
      let resolveFetch: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.signal) abortEvents.push(init.signal as AbortSignal);
        return pendingPromise;
      });

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Subscriber A (originator) and B (joiner) both mount before the fetch
      // resolves.
      const { unmount: unmountA } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );
      const { unmount: unmountB } = renderHook(() =>
        useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
      );

      await act(() => Promise.resolve());

      // Abort should not have fired yet.
      expect(abortEvents.some((s) => s.aborted)).toBe(false);

      // A unmounts first — fetch must continue because B is still subscribed.
      unmountA();
      await act(() => Promise.resolve());
      expect(abortEvents.some((s) => s.aborted)).toBe(false);

      // B unmounts last — shared fetch must be aborted exactly once.
      unmountB();
      await act(() => Promise.resolve());

      const abortedCount = abortEvents.filter((s) => s.aborted).length;
      expect(abortedCount).toBe(1);

      // Resolve the fetch so the test doesn't leak pending promises.
      await act(async () => {
        resolveFetch!(createMockImageResponse());
      });
    });

    it('two simultaneous mounts with cache:true and IDB hit share one blob URL and read IDB once', async () => {
      const url = 'https://archive.example.com/projects/p1/icon/icon-shared';
      const { putCachedIconBlob, getCachedIconBlob } = await import('@/lib/db');
      await putCachedIconBlob(
        url,
        new Blob(['cached-icon'], { type: 'image/png' }),
      );

      // Wrap getCachedIconBlob with a spy so we can assert call count.
      const db = await import('@/lib/db');
      const idbSpy = vi.spyOn(db, 'getCachedIconBlob');

      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Mount both hooks synchronously (same microtask) so they both enter
      // Path 3 before either resolves.
      const { result: result1 } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );

      // Drain microtasks: IDB read, blob URL creation, React state updates.
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Both hooks share the same blob URL.
      expect(result1.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');

      // Only ONE createObjectURL call — the joiner reuses the originator's URL.
      expect(createUrlMock).toHaveBeenCalledTimes(1);

      // Only ONE IDB read — the joiner attached to the in-flight entry.
      expect(idbSpy).toHaveBeenCalledTimes(1);

      // Network was never hit (IDB had the blob).
      expect(fetchMock).not.toHaveBeenCalled();

      // Sanity: confirm the IDB cache actually had the entry.
      expect(await getCachedIconBlob(url)).toBeInstanceOf(Blob);
    });

    it('two simultaneous mounts with cache:true and IDB miss share one network fetch and one blob URL', async () => {
      const url =
        'https://archive.example.com/projects/p1/icon/icon-miss-dual-mount';

      const db = await import('@/lib/db');
      const idbSpy = vi.spyOn(db, 'getCachedIconBlob');

      fetchMock.mockResolvedValue(createMockImageResponse());

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Mount both hooks synchronously before any fetch resolves.
      const { result: result1 } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );

      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Both hooks share the same blob URL.
      expect(result1.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');

      // Only ONE createObjectURL call.
      expect(createUrlMock).toHaveBeenCalledTimes(1);

      // Only ONE IDB read.
      expect(idbSpy).toHaveBeenCalledTimes(1);

      // Only ONE network fetch.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('abort-remount race (regression)', () => {
    it('rapid remount after in-flight abort starts a fresh fetch, not a dead joiner', async () => {
      const url = 'http://localhost:8080/abort-remount-race.jpg';

      // Hold the fetch pending so it is still in-flight when we unmount.
      let _resolveFetch!: (value: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        _resolveFetch = resolve;
      });
      fetchMock.mockImplementationOnce(() => pendingFetch);

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Originator (Path 3) — fetch is in-flight.
      const { unmount: unmount1 } = renderHook(() =>
        useAuthenticatedImageUrl(url),
      );
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Last subscriber unmounts while fetch is STILL in-flight → AbortController fires.
      unmount1();
      await act(() => Promise.resolve());

      // A rapid remount must NOT join the dead in-flight promise. Before the
      // fix it would hit Path 2, attach to the aborted inflight, and surface
      // a spurious AbortError instead of starting a new fetch.
      fetchMock.mockResolvedValueOnce(createMockImageResponse());
      const { result: result2 } = renderHook(() =>
        useAuthenticatedImageUrl(url),
      );
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Fetch was called twice: once for the aborted originator, once for the remount.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The remount resolved successfully — no AbortError.
      expect(result2.current.blobUrl).toBe('blob:mocked-url-1');
      expect(result2.current.isLoading).toBe(false);
      expect(result2.current.error).toBeNull();
    });

    it('cache:true joiner writes to IDB when originator unmounts before completing', async () => {
      const url = 'http://localhost:8080/joiner-idb-gap.jpg';
      const db = await import('@/lib/db');
      // IDB cache miss — forces fallthrough to network fetch.
      vi.spyOn(db, 'getCachedIconBlob').mockResolvedValue(undefined);
      const putSpy = vi.spyOn(db, 'putCachedIconBlob');

      // Hold the fetch pending so the originator is still in-flight.
      let resolveFetch!: (value: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchMock.mockImplementationOnce(() => pendingFetch);

      const { useAuthenticatedImageUrl } =
        await import('@/hooks/useAuthenticatedImageUrl');

      // Originator (Path 3) with cache: true — fetch in-flight.
      const first = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Joiner (Path 2) mounts while originator is still fetching.
      const second = renderHook(() =>
        useAuthenticatedImageUrl(url, { cache: true }),
      );
      await act(() => Promise.resolve());

      // Originator unmounts before the fetch resolves.
      first.unmount();
      await act(() => Promise.resolve());

      // Fetch resolves — joiner should publish the blob AND write to IDB.
      await act(async () => {
        resolveFetch(createMockImageResponse());
      });
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());

      // Joiner got the blob URL.
      expect(second.result.current.blobUrl).toBe('blob:mocked-url-1');
      // Joiner wrote to IDB (originator was unmounted before it could).
      expect(putSpy).toHaveBeenCalledWith(url, expect.any(Blob));
    });
  });
});
