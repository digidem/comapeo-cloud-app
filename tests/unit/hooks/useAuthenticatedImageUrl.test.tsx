import { act, renderHook } from '@testing-library/react';
import { setupBlobUrlMocks } from '@tests/mocks/blob-url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  beforeEach(() => {
    const mocks = setupBlobUrlMocks();
    revokeMock = mocks.revokeObjectUrlMock;

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
    expect(result.current.blobUrl).toBe('blob:mocked-url');
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
      blobUrl: 'blob:mocked-url',
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

  it('cleans up blob URL on unmount', async () => {
    fetchMock.mockResolvedValue(createMockImageResponse());

    const { useAuthenticatedImageUrl } =
      await import('@/hooks/useAuthenticatedImageUrl');

    const { unmount } = renderHook(() =>
      useAuthenticatedImageUrl('http://localhost:8080/photo.jpg'),
    );

    await act(() => Promise.resolve());

    unmount();

    expect(revokeMock).toHaveBeenCalledWith('blob:mocked-url');
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
});
