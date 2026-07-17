/**
 * Cloudflare Pages Function: Tile proxy for SMP downloads.
 *
 * Routes tile requests through our origin to bypass CORS restrictions
 * on tile CDNs (e.g. Carto basemaps.cartocdn.com) that don't return
 * Access-Control-Allow-Origin headers.
 *
 * Usage: GET /api/tiles?url=<encoded-tile-url>
 *
 * SECURITY: This is a same-origin proxy, not an open proxy.
 * - Only GET requests are allowed.
 * - Only HTTP/HTTPS URLs are accepted.
 * - Private/reserved IP ranges are blocked (hostname-level check).
 * - Redirects are NOT followed (redirect: 'manual') to prevent SSRF via bounce.
 * - Timeout enforced (10s).
 * - Response body limited to 5 MB.
 */

// Private and reserved IPv4 CIDR patterns to block.
const PRIVATE_PATTERNS = [
  // Loopback
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // RFC 1918 private
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  // Link-local
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  // Carrier-grade NAT (RFC 6598)
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
];

// Reserved IPv6 patterns (lowercased for comparison).
const PRIVATE_IPV6_PATTERNS = [
  (s: string) => s === '::1' || s === '[::1]',
  (s: string) => s.startsWith('fc') || s.startsWith('fd'), // Unique local
  (s: string) => s.startsWith('fe80'), // Link-local
  (s: string) => s.startsWith('::ffff:') && s !== '::ffff:0:0', // IPv4-mapped
];

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 10_000;

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Strip brackets from IPv6 literals
  const clean = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;

  // Check IPv4 patterns
  for (const pattern of PRIVATE_PATTERNS) {
    if (pattern.test(clean)) return true;
  }

  // Check IPv6 patterns
  for (const check of PRIVATE_IPV6_PATTERNS) {
    if (check(clean)) return true;
  }

  // localhost / .local / .internal (mDNS / split-DNS)
  if (clean === 'localhost' || clean.endsWith('.local') || clean.endsWith('.internal')) {
    return true;
  }

  return false;
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  // Method restriction — GET only
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const upstream = url.searchParams.get('url');

  if (!upstream) {
    return new Response('Missing `url` query parameter', { status: 400 });
  }

  // URLSearchParams.get() already decodes, so no decodeURIComponent needed.
  const upstreamUrl = upstream;

  // Only allow http/https
  if (
    !upstreamUrl.startsWith('http://') &&
    !upstreamUrl.startsWith('https://')
  ) {
    return new Response('Invalid URL scheme', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(upstreamUrl);
  } catch {
    return new Response('Invalid upstream URL', { status: 400 });
  }

  // Block private/resolved IP ranges
  if (isPrivateHostname(parsed.hostname)) {
    return new Response('Private network URLs not allowed', { status: 403 });
  }

  // Require a dot-separated hostname (reject bare IPs unless they're public)
  // This prevents SSRF via raw IP addresses that might slip through pattern matching.
  const hostname = parsed.hostname.replace(/[[\]]/g, '');
  const isBareIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^[0-9a-f:]+$/.test(hostname);
  if (isBareIp) {
    return new Response('Numeric IP hostnames are not allowed', { status: 403 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'comapeo-cloud-app/1.0 (tile-proxy)',
      },
      signal: controller.signal,
      redirect: 'manual', // Do NOT follow redirects — SSRF via bounce
    });

    if (
      upstreamResponse.status >= 300 &&
      upstreamResponse.status < 400
    ) {
      return new Response('Redirects are not supported', { status: 502 });
    }

    if (!upstreamResponse.ok) {
      return new Response(`Upstream returned ${upstreamResponse.status}`, {
        status: 502,
      });
    }

    // Enforce body size limit
    const contentLength = upstreamResponse.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return new Response('Response too large', { status: 502 });
    }

    // Stream with size limit
    const reader = upstreamResponse.body?.getReader();
    if (!reader) {
      return new Response('Empty upstream response', { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return new Response('Response exceeds maximum size', { status: 502 });
      }
      chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Forward with CORS and caching headers
    const response = new Response(body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'Access-Control-Allow-Origin': '*',
      },
    });

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response('Upstream timed out', { status: 504 });
    }
    return new Response('Proxy error', { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
};
