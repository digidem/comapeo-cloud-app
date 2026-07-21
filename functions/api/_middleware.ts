/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Pages Function: Global /api/* middleware.
 *
 * PURPOSE
 * =======
 * Routes /api/* requests to the appropriate handler:
 *   - /api/tiles*        → forwarded via context.next() to functions/api/tiles/index.ts
 *   - /api/invites/*     → forwarded via context.next() to functions/api/invites/{encrypt,decrypt}.ts
 *   - everything else    → archive proxy (forwards to the remote CoMapeo archive server
 *                          indicated by the x-target-url header)
 *
 * WHY MIDDLEWARE, NOT [[path]].ts
 * ===============================
 * Cloudflare Pages upgraded its path-to-regexp dependency from v6 to v8 in
 * the production runtime. The [[path]].ts double-bracket filename convention
 * is compiled into a route pattern of `/api/:path*` — which is v6 syntax.
 * v8 rejects this at cold start with "TypeError: Missing parameter name",
 * killing the entire Functions worker (CF Error 1101) and breaking every
 * /api/* route including the archive proxy.
 *
 * Cloudflare's recommended workaround is to use _middleware.ts instead,
 * because middleware has no synthesised route pattern — the path-to-regexp
 * parser is never invoked, the worker boots cleanly, and the same-origin
 * proxy behaviour is preserved end to end.
 *
 * Behavioural difference vs [[path]].ts: middleware runs BEFORE specific
 * route handlers (inverse precedence). We therefore must explicitly call
 * `context.next()` for the static-segment routes (/api/tiles, /api/invites/*)
 * or we would shadow their handlers.
 */
import {
  ARCHIVE_TARGET_HEADER,
  buildArchiveTargetUrl,
  createForwardHeaders,
  stripApiPrefix,
  validateArchiveProxyRequest,
} from '../../src/lib/archive-proxy';
import { jsonError, withNoStore } from '../../src/lib/pages-fn-utils';

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

export const onRequest: PagesFunction = async (context: PagesContext) => {
  const url = new URL(context.request.url);

  // Pass tiles requests through to functions/api/tiles/index.ts.
  // Tiles has its own static-segment handler — middleware must not shadow it.
  if (url.pathname === '/api/tiles' || url.pathname.startsWith('/api/tiles/')) {
    return context.next();
  }

  // Pass invite requests through to functions/api/invites/{encrypt,decrypt}.ts.
  if (
    url.pathname === '/api/invites/encrypt' ||
    url.pathname === '/api/invites/decrypt'
  ) {
    return context.next();
  }

  // Everything else under /api/* is handled by the archive proxy.
  const upstreamPath = stripApiPrefix(url.pathname);
  const proxyRequest = validateArchiveProxyRequest(
    context.request.method,
    upstreamPath,
  );
  if (!proxyRequest.ok) {
    return jsonError(405, proxyRequest.code, proxyRequest.message);
  }

  const target = buildArchiveTargetUrl(
    context.request.url,
    context.request.headers.get(ARCHIVE_TARGET_HEADER),
  );
  if (!target.ok) {
    return jsonError(400, 'ARCHIVE_PROXY_BAD_TARGET', target.message);
  }

  const method = context.request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : context.request.body;
  const proxiedRequest = new Request(target.value, {
    method,
    headers: createForwardHeaders(context.request.headers),
    body,
    redirect: 'manual',
  });

  try {
    return withNoStore(await fetch(proxiedRequest));
  } catch {
    return jsonError(
      502,
      'ARCHIVE_PROXY_UPSTREAM_FAILED',
      'Archive server request failed',
    );
  }
};
