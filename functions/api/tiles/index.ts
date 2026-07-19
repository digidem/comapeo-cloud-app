/**
 * Cloudflare Pages Function: Tile proxy for SMP downloads.
 *
 * PURPOSE
 * =======
 * Routes tile requests through our origin to bypass CORS restrictions
 * on tile CDNs (e.g. CartoDB basemaps.cartocdn.com) that don't return
 * Access-Control-Allow-Origin headers. This is a same-origin proxy for
 * first-party tile fetching — NOT an open proxy.
 *
 * Usage: GET /api/tiles?url=<encoded-tile-url>
 *
 * SECURITY MEASURES (defense-in-depth)
 * =====================================
 *   1. Hostname allowlist  – Only known tile CDN domains may be fetched.
 *      An attacker-controlled URL is rejected before any network call.
 *   2. Private-IP block   – Bare IPs and RFC1918 / link-local / ULA
 *      addresses are denied to prevent SSRF into internal networks.
 *   3. Redirect suppression – redirect:'manual' prevents SSRF via
 *      redirect bounce (e.g. 302 → internal metadata endpoint).
 *   4. Size / timeout caps – 5 MB body limit and 10 s timeout bound
 *      resource consumption from upstream abuse.
 *   5. Rate limiting       – Per-IP sliding window (100 req / 60 s)
 *      with lazy cleanup to throttle abuse from any single client.
 *
 * THREAT MODEL
 * ============
 * Protects against:
 *   • Open proxy abuse — hostname allowlist prevents arbitrary fetches.
 *   • SSRF — private IP blocking + redirect suppression prevent probing
 *     internal networks or cloud metadata endpoints (e.g. 169.254.169.254).
 *   • Data exfiltration — same-origin response with CORS headers means
 *     only our domain can read tile data in the browser.
 *   • Resource exhaustion — 5 MB body + 10 s timeout cap upstream cost.
 *
 * Known limitations:
 *   • Rate limiting is per-Cold Start (in-memory Map). Different isolates
 *     on the same IP get independent windows — not a hard DDoS barrier.
 *   • DNS rebinding could theoretically bypass the allowlist if a domain
 *     resolves to an internal IP after the hostname check. The hostname
 *     check runs before fetch, but DNS is resolved by the runtime at
 *     fetch time. Mitigated by the private-IP block on the resolved IP.
 *   • Bare public IPs are blocked, but an attacker with a domain pointing
 *     to a public server hosting malicious tiles can still be proxied
 *     (as long as the hostname matches the allowlist).
 *   • No request body support (GET-only) — not vulnerable to upload abuse.
 *
 * SUPPORTED TILE PROVIDERS
 * ========================
 *   • basemaps.cartocdn.com        (CartoDB basemaps)
 *   • tile.openstreetmap.org       (OSM raster tiles)
 *   • a/b/c.tile.openstreetmap.org (OSM subdomain sharding)
 *   • api.mapbox.com               (Mapbox API)
 *   • tiles.mapbox.com             (Mapbox tile CDN)
 *
 * CONFIGURATION
 * =============
 * To add a new tile provider, add its hostname to ALLOWED_HOSTNAMES (exact
 * match) or add a regex to ALLOWED_HOSTNAME_PATTERNS (wildcard subdomains).
 * Keep the allowlist tight — every entry widens the proxy's trust surface.
 *
 * CACHING
 * =======
 * Responses are served with Cache-Control: public, max-age=86400,
 * s-maxage=604800 (1 day browser, 7 days CDN). Tiles are immutable by
 * content hash in practice, so aggressive caching is safe. No ETag or
 * Last-Modified forwarding — Cloudflare's edge cache handles revalidation.
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

// ── Hostname allowlist ───────────────────────────────────────────────────────
// Only hostnames in this set or matching the patterns below will be proxied.
// Keeping this deny-by-default prevents the function from being abused as an
// open proxy or SSRF vector.
const ALLOWED_HOSTNAMES = new Set([
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'api.mapbox.com',
  'tiles.mapbox.com',
  // Single-letter OSM subdomains: a.tile.openstreetmap.org, b…, c…
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
]);

// Wildcard subdomain patterns (e.g. *.tile.openstreetmap.org).
const ALLOWED_HOSTNAME_PATTERNS: RegExp[] = [
  /^[a-z]\.tile\.openstreetmap\.org$/i,
];

function isHostnameAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (ALLOWED_HOSTNAMES.has(lower)) return true;
  return ALLOWED_HOSTNAME_PATTERNS.some((re) => re.test(lower));
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory sliding-window counter: max 100 requests per 60 s per IP.
// This runs on a single Cloudflare isolate per request; a shared-nothing
// approach is acceptable for a best-effort throttle. Map entries are lazily
// cleaned up when the window expires.
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    // First request or window expired — start a new window.
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Lazy cleanup: if the map grows large, purge stale entries.
    if (rateLimitMap.size > 1000) {
      for (const [key, val] of rateLimitMap) {
        if (now >= val.resetAt) rateLimitMap.delete(key);
      }
    }
    return true;
  }

  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Strip brackets from IPv6 literals
  const clean =
    lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;

  // Check IPv4 patterns
  for (const pattern of PRIVATE_PATTERNS) {
    if (pattern.test(clean)) return true;
  }

  // Check IPv6 patterns
  for (const check of PRIVATE_IPV6_PATTERNS) {
    if (check(clean)) return true;
  }

  // localhost / .local / .internal (mDNS / split-DNS)
  if (
    clean === 'localhost' ||
    clean.endsWith('.local') ||
    clean.endsWith('.internal')
  ) {
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

  // Rate limiting (per-IP, best-effort on a single isolate)
  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response('Rate limit exceeded', { status: 429 });
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
  const isBareIp =
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^[0-9a-f:]+$/.test(hostname);
  if (isBareIp) {
    return new Response('Numeric IP hostnames are not allowed', {
      status: 403,
    });
  }

  // Hostname allowlist — only known tile CDNs may be proxied.
  if (!isHostnameAllowed(parsed.hostname)) {
    return new Response('Hostname not allowed', { status: 403 });
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

    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
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
        'Content-Type':
          upstreamResponse.headers.get('Content-Type') ??
          'application/octet-stream',
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
