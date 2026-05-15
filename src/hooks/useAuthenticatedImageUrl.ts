import { useEffect, useRef, useState } from 'react';

import { ARCHIVE_TARGET_HEADER } from '@/lib/archive-proxy';
import { useAuthStore } from '@/stores/auth-store';

interface AuthenticatedImageState {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

interface ArchiveCredentials {
  baseUrl: string;
  token: string;
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
 * Fetches an image URL with proper Authorization headers and returns a blob URL.
 *
 * For remote archive URLs (matching a server in the auth store), the request is
 * routed through the /api proxy with x-target-url header.
 * For other URLs (local server), the URL is used as-is with the store token.
 *
 * Re-tries when auth store servers change (e.g. after hydration from IndexedDB).
 */
export function useAuthenticatedImageUrl(url: string): AuthenticatedImageState {
  const [state, setState] = useState<AuthenticatedImageState>(() => {
    if (!url) return { blobUrl: null, isLoading: false, error: null };
    return { blobUrl: null, isLoading: true, error: null };
  });

  const mountedRef = useRef(true);
  const previousBlobUrlRef = useRef<string | null>(null);

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
      : findMatchingServer(parsedUrl, servers);

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

    setImageState({ blobUrl: null, isLoading: true, error: null });

    fetch(fetchUrl, { headers: fetchHeaders, signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled || !mountedRef.current) return;
        const blobUrl = URL.createObjectURL(blob);
        previousBlobUrlRef.current = blobUrl;
        setState({ blobUrl, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ blobUrl: null, isLoading: false, error: err as Error });
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      controller.abort();
      if (previousBlobUrlRef.current) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
        previousBlobUrlRef.current = null;
      }
    };
  }, [url, servers, token, baseUrl]);

  return state;
}
