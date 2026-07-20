/**
 * Shared tile CDN hostname allowlist.
 *
 * Used by both the `/api/tiles` Cloudflare Pages Function proxy
 * (functions/api/tiles/index.ts) and the client-side custom URL validation
 * in StylePicker, so the two never drift out of sync. A custom raster URL
 * whose hostname isn't listed here will be proxied through `/api/tiles`
 * during SMP downloads and get a 403 from the function's own allowlist
 * check — the client warns about this up front.
 */

// Exact hostname matches.
export const ALLOWED_HOSTNAMES = new Set([
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'api.mapbox.com',
  'tiles.mapbox.com',
  // Single-letter OSM subdomains: a.tile.openstreetmap.org, b…, c…
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  // ArcGIS / Esri basemaps
  'server.arcgisonline.com',
  'services.arcgisonline.com',
  // French OSM tile mirrors
  'a.tile.openstreetmap.de',
  'b.tile.openstreetmap.de',
  'c.tile.openstreetmap.de',
  'tiles.maps.geoportail.gouv.fr',
  // OpenTopoMap
  'tile.opentopomap.org',
  // USGS National Map
  'basemap.nationalmap.gov',
]);

// Wildcard subdomain patterns (e.g. *.tile.openstreetmap.org).
export const ALLOWED_HOSTNAME_PATTERNS: RegExp[] = [
  /^[a-z]\.tile\.openstreetmap\.org$/i,
  /^[\w-]+\.arcgisonline\.com$/i,
  /^[\w-]+\.openstreetmap\.fr$/i,
];

export function isHostnameAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (ALLOWED_HOSTNAMES.has(lower)) return true;
  return ALLOWED_HOSTNAME_PATTERNS.some((re) => re.test(lower));
}
