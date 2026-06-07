import { useEffect, useRef, useState } from 'react';

import { ARCHIVE_TARGET_HEADER } from '@/lib/archive-proxy';
import { getCachedIconBlob, putCachedIconBlob } from '@/lib/db';
import { type CacheKey, createImageBlobCache } from '@/lib/image-blob-cache';
import { useAuthStore } from '@/stores/auth-store';

interface AuthenticatedImageState {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

interface UseAuthenticatedImageUrlOptions {
  /**
   * When true, the fetched blob is cached in IndexedDB (keyed by `url`) and
   * served from there on subsequent loads for instant display. Intended for
   * small, stable assets like category icons — NOT large photos.
   */
  cache?: boolean;
}

interface ArchiveCredentials {
  baseUrl: string;
  token: string;
}

// Module-scope singleton: survives component unmount/remount
const blobCache = createImageBlobCache();

/** @internal Reset the in-memory blob cache between tests */
export function __resetImageBlobCache(): void {
  blobCache.clear();
}

function getArchiveBasePath(baseUrl: string): string | null {
  try {
    const pathname = new URL(baseUrl).pathname.replace(/\/+$/, '');
    return pathname === '' ? '/' : pathname;
  } catch {
    return null;
  }
}

function removeArchiveBasePath(pathname: string, baseUrl: string): string {
  const basePath = getArchiveBasePath(baseUrl);
  if (!basePath || basePath === '/') return pathname;

  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

function findMatchingServer(
  parsedUrl: URL,
  servers: ArchiveCredentials[],
): ArchiveCredentials | undefined {
  const sameOriginServers = servers.filter((server) => {
    try {
      return new URL(server.baseUrl).origin === parsedUrl.origin;
    } catch {
      return false;
    }
  });

  return (
    sameOriginServers.find((server) => {
      const basePath = getArchiveBasePath(server.baseUrl);
      return (
        basePath === '/' ||
        parsedUrl.pathname === basePath ||
        parsedUrl.pathname.startsWith(`${basePath}/`)
      );
    }) ?? sameOriginServers[0]
  );
}

function getRelativeArchiveCredentials({
  baseUrl,
  servers,
  token,
}: {
  baseUrl: string | null;
  servers: ArchiveCredentials[];
  token: string | null;
}): ArchiveCredentials | null {
  if (baseUrl && token) return { baseUrl, token };
  return servers.length === 1 ? servers[0]! : null;
}

/**
 * Build a cache key from the image URL and the server context that serves it.
 *
 * The key includes the server kind, base URL, AND the auth token so that
 * a token change (login/logout, server re-auth) naturally invalidates the
 * cache by producing a new key — stale entries are simply unused and
 * eventually evicted by the grace-period timer.
 */
function buildImageCacheKey(
  url: string,
  matchingServer: ArchiveCredentials | null,
  localToken: string | null,
): CacheKey {
  if (matchingServer) {
    return `archive:${matchingServer.baseUrl}|${matchingServer.token}|${url}`;
  }
  return `local:${localToken ?? ''}|${url}`;
}

/**
 * Fetches an image URL with proper Authorization headers and returns a blob URL.
 *
 * For remote archive URLs (matching a server in the auth store), the request is
 * routed through the /api proxy with x-target-url header.
 * For other URLs (local server), the URL is used as-is with the store token.
 *
 * Uses an in-memory ref-counted blob URL cache so that:
 * - Same image rendered by multiple components = 1 network request, 1 blob URL
 * - Blob URLs survive component unmount/remount (30s grace period)
 * - Cache entries are scoped to (URL + auth context), so token changes
 *   produce new keys and old entries are simply unused until eviction
 */
export function useAuthenticatedImageUrl(
  url: string,
  options?: UseAuthenticatedImageUrlOptions,
): AuthenticatedImageState {
  const cache = options?.cache ?? false;
  const [state, setState] = useState<AuthenticatedImageState>(() => {
    if (!url) return { blobUrl: null, isLoading: false, error: null };
    return { blobUrl: null, isLoading: true, error: null };
  });

  const mountedRef = useRef(true);
  const previousCacheKeyRef = useRef<CacheKey | null>(null);

  // Subscribe to auth store to re-fetch when servers or token change
  const servers = useAuthStore((s) => s.servers);
  const token = useAuthStore((s) => s.token);
  const baseUrl = useAuthStore((s) => s.baseUrl);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const setImageState = (nextState: AuthenticatedImageState) => {
      queueMicrotask(() => {
        if (!cancelled && mountedRef.current) {
          setState(nextState);
        }
      });
    };

    // Early return for empty/invalid URL
    if (!url) {
      setImageState({ blobUrl: null, isLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const isRelativeUrl = url.startsWith('/') && !url.startsWith('//');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(
        url,
        isRelativeUrl ? window.location.origin : undefined,
      );
    } catch {
      setImageState({ blobUrl: null, isLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const matchingServer = isRelativeUrl
      ? getRelativeArchiveCredentials({ baseUrl, servers, token })
      : (findMatchingServer(parsedUrl, servers) ?? null);

    // Compute the in-memory cache key
    const cacheKey = buildImageCacheKey(url, matchingServer, token);

    // Track which key THIS effect invocation holds a ref on.
    // The cleanup function handles unref — no need to unref the previous
    // key here (that would double-unref when the cleanup already ran).
    previousCacheKeyRef.current = cacheKey;

    let fetchUrl: string;
    let fetchHeaders: Record<string, string>;

    if (matchingServer) {
      // Remote archive: route through /api proxy
      const proxyPath = isRelativeUrl
        ? parsedUrl.pathname
        : removeArchiveBasePath(parsedUrl.pathname, matchingServer.baseUrl);
      fetchUrl = '/api' + proxyPath + parsedUrl.search;
      fetchHeaders = {
        Authorization: `Bearer ${matchingServer.token}`,
        [ARCHIVE_TARGET_HEADER]: matchingServer.baseUrl,
      };
    } else {
      // Local server or unmatched: use URL as-is
      fetchUrl = url;
      fetchHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    }

    const controller = new AbortController();

    // === Path 1: cache hit on a resolved entry — reuse the blob URL ===
    const cachedEntry = blobCache.get(cacheKey);
    if (cachedEntry && cachedEntry.blobUrl && !cachedEntry.inflight) {
      blobCache.ref(cacheKey);
      setImageState({
        blobUrl: cachedEntry.blobUrl,
        isLoading: false,
        error: null,
      });
      return () => {
        cancelled = true;
        mountedRef.current = false;
        blobCache.unref(cacheKey);
      };
    }

    // === Path 2: another fetch is in-flight — claim a slot and reuse its result ===
    if (cachedEntry && cachedEntry.inflight) {
      blobCache.ref(cacheKey); // Claim a ref slot so the entry doesn't evict mid-flight
      setImageState({ blobUrl: null, isLoading: true, error: null });

      cachedEntry.inflight
        .then(() => {
          if (cancelled || !mountedRef.current) return;
          // The first subscriber already created the blob URL. Just read it
          // from the cache — do NOT create a new one, do NOT increment ref.
          const resolved = blobCache.get(cacheKey);
          if (resolved && resolved.blobUrl) {
            setState({
              blobUrl: resolved.blobUrl,
              isLoading: false,
              error: null,
            });
          }
        })
        .catch((err: unknown) => {
          if (cancelled || !mountedRef.current) return;
          setState({
            blobUrl: null,
            isLoading: false,
            error: err as Error,
          });
        });

      return () => {
        cancelled = true;
        mountedRef.current = false;
        controller.abort();
        blobCache.unref(cacheKey);
      };
    }

    // === Path 3: cache miss — start a new fetch and claim the first ref slot ===
    setImageState({ blobUrl: null, isLoading: true, error: null });

    const publishBlob = (blob: Blob) => {
      // Only this path creates a blob URL. Subsequent subscribers reuse it.
      const blobUrl = URL.createObjectURL(blob);
      // Preserve the current refCount — in-flight subscribers may have already
      // claimed additional refs via blobCache.ref() while the fetch was pending.
      const existing = blobCache.get(cacheKey);
      const preservedRefCount = existing?.refCount ?? 1;
      // Always store in the in-memory cache — even if the originating
      // subscriber has unmounted, other in-flight subscribers need the
      // resolved blob URL.
      blobCache.set(cacheKey, {
        blobUrl,
        serverToken: matchingServer?.token ?? token ?? '',
        serverSignature: JSON.stringify(servers.map((s) => s.id)),
        refCount: preservedRefCount,
      });
      // Only update React state if the originating subscriber is still mounted
      if (!cancelled && mountedRef.current) {
        setState({ blobUrl, isLoading: false, error: null });
      }
    };

    const run = async () => {
      // Serve from the local icon cache first when caching is enabled, so
      // cached icons render instantly without a network round-trip.
      if (cache) {
        try {
          const cachedBlob = await getCachedIconBlob(url);
          if (cancelled || !mountedRef.current) return;
          if (cachedBlob) {
            publishBlob(cachedBlob);
            return;
          }
        } catch {
          // Cache read failed — fall through to the network fetch.
        }
      }

      // Create a fetch promise for deduplication
      const fetchPromise = (async () => {
        const response = await fetch(fetchUrl, {
          headers: fetchHeaders,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })();

      // Register the inflight promise so other subscribers can share it.
      // refCount: 1 claims the first slot for THIS hook. Other subscribers
      // call ref() to claim additional slots.
      blobCache.set(cacheKey, {
        blobUrl: '',
        serverToken: matchingServer?.token ?? token ?? '',
        serverSignature: JSON.stringify(servers.map((s) => s.id)),
        inflight: fetchPromise,
        refCount: 1,
      });

      try {
        const blob = await fetchPromise;
        // Always publish to cache (other subscribers may be waiting),
        // but only write to the IDB icon cache if still mounted.
        if (cache && !cancelled && mountedRef.current) {
          // Best-effort write; never block display on the cache.
          void putCachedIconBlob(url, blob).catch(() => {});
        }
        publishBlob(blob);
      } catch (err: unknown) {
        // Drop the failed inflight entry so the next mount can retry
        // instead of attaching to a permanently rejected promise.
        blobCache.invalidate((k) => k === cacheKey);
        if (cancelled || !mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ blobUrl: null, isLoading: false, error: err as Error });
      }
    };

    void run();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Unref first, then check if other subscribers are still waiting.
      // If so, don't abort — let the shared fetch continue for them.
      blobCache.unref(cacheKey);
      const afterUnref = blobCache.get(cacheKey);
      if (!afterUnref || afterUnref.refCount === 0) {
        controller.abort();
      }
    };
  }, [url, servers, token, baseUrl, cache]);

  return state;
}
