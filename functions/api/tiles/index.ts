/**
 * Cloudflare Pages Function: Tile proxy for SMP downloads.
 *
 * Routes tile requests through our origin to bypass CORS restrictions
 * on tile CDNs (e.g. Carto basemaps.cartocdn.com) that don't return
 * Access-Control-Allow-Origin headers.
 *
 * Usage: GET /api/tiles?url=<encoded-tile-url>
 */
export const onRequest = async (context: any) => {
  const { request } = context;
  const url = new URL(request.url);
  const upstream = url.searchParams.get('url');

  if (!upstream) {
    return new Response('Missing `url` query parameter', { status: 400 });
  }

  let upstreamUrl: string;
  try {
    upstreamUrl = decodeURIComponent(upstream);
  } catch {
    return new Response('Invalid `url` parameter encoding', { status: 400 });
  }

  // Basic validation: only allow http/https URLs
  if (
    !upstreamUrl.startsWith('http://') &&
    !upstreamUrl.startsWith('https://')
  ) {
    return new Response('Invalid URL scheme', { status: 400 });
  }

  // Block internal/private URLs
  try {
    const parsed = new URL(upstreamUrl);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname.endsWith('.local') ||
      parsed.hostname.startsWith('192.168.') ||
      parsed.hostname.startsWith('10.') ||
      parsed.hostname.startsWith('172.16.')
    ) {
      return new Response('Private network URLs not allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid upstream URL', { status: 400 });
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      'User-Agent': 'comapeo-cloud-app/1.0 (tile-proxy)',
    },
  });

  if (!upstreamResponse.ok) {
    return new Response(`Upstream returned ${upstreamResponse.status}`, {
      status: 502,
    });
  }

  // Forward with CORS and caching headers
  const response = new Response(upstreamResponse.body, upstreamResponse);
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Cache-Control',
    'public, max-age=86400, s-maxage=604800',
  );

  return response;
};
