import type { StyleSpecification } from 'maplibre-gl';

import type { ImageryBasemap } from '@/lib/schemas/imagery-source';

/**
 * Convert an ImageryBasemap into a value usable by react-map-gl's `mapStyle` prop.
 * - 'style' type: returns the style URL string as-is (vector GL style).
 * - 'raster' type: builds a minimal StyleSpecification with one raster source + layer.
 */
export function basemapToMapStyle(
  basemap: ImageryBasemap,
): string | StyleSpecification {
  if (basemap.type === 'style') {
    return basemap.url;
  }

  // Detect TMS from {-y} in URL or explicit scheme declaration
  const isTms = basemap.scheme === 'tms' || basemap.url.includes('{-y}');

  // Build a minimal raster style
  const tiles = normalizeTileUrl(basemap.url);

  const sourceConfig: StyleSpecification['sources'] = {
    [basemap.id]: {
      type: 'raster',
      tiles,
      attribution: basemap.attribution ?? '',
      maxzoom: basemap.maxZoom ?? 22,
      minzoom: basemap.minZoom ?? 0,
      tileSize: basemap.tileSize ?? 256,
      // Only set scheme when TMS — omitting it uses default XYZ behavior
      ...(isTms ? { scheme: 'tms' as const } : {}),
    },
  };

  // NOTE: We intentionally do NOT set maxzoom on the raster layer.
  // Layer maxzoom is a visibility bound — tiles disappear at that zoom.
  // Source maxzoom already caps tile requests and MapLibre overscales gracefully.
  const style: StyleSpecification = {
    version: 8,
    sources: sourceConfig,
    layers: [
      {
        id: `${basemap.id}-layer`,
        type: 'raster',
        source: basemap.id,
      },
    ],
  };

  return style;
}

/**
 * Normalize ELI-style tile URL templates to MapLibre format.
 *
 * Handles:
 * - `{zoom}` → `{z}` (ELI alias)
 * - `{switch:a,b,c}` → expanded into multiple URLs (one per variant)
 * - `{-y}` → `{y}` (TMS inverted Y — caller must set scheme:'tms' on source)
 *
 * Unsupported ELI patterns (not used in curated catalog, rare in practice):
 * - `{quadkey}` — Bing quadkey tile addressing (Bing API deprecated)
 * - `{bbox-epsg-3857}` — WMS bbox parameter (WMS services are not raster tile servers)
 * - `{apikey}`, `{key}` — provider API keys (would need runtime injection)
 *
 * @returns Array of normalized URL strings (one per switch variant)
 */
export function normalizeTileUrl(url: string): string[] {
  // Replace {-y} with {y} — MapLibre handles Y-flipping when scheme:'tms' is set
  const normalized = url.replace(/\{-y\}/g, '{y}');

  // Handle {switch:a,b,c} — expand into multiple URLs
  const switchMatch = normalized.match(/\{switch:([^}]+)\}/);
  if (switchMatch) {
    const variants = switchMatch[1]!.split(',');
    return variants.map((variant) =>
      normalized
        .replace(`{switch:${switchMatch[1]}}`, variant.trim())
        .replace(/\{zoom\}/g, '{z}'),
    );
  }

  // Just replace {zoom} with {z}
  return [normalized.replace(/\{zoom\}/g, '{z}')];
}
