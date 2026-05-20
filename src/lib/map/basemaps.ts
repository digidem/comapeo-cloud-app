import type { ImageryBasemap } from '@/lib/schemas/imagery-source';

/**
 * Curated basemap catalog sourced from osmlab/editor-layer-index and public tile providers.
 * All entries are free-to-use with attribution. No API keys required.
 *
 * Attribution strings are verbatim from the ELI catalog to satisfy provider terms.
 */
export const BASEMAP_CATALOG: ImageryBasemap[] = [
  {
    id: 'carto-positron',
    name: 'CartoDB Positron',
    category: 'street',
    type: 'style',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 18,
  },
  {
    id: 'carto-dark-matter',
    name: 'CartoDB Dark Matter',
    category: 'dark',
    type: 'style',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 18,
  },
  {
    id: 'osm-standard',
    name: 'OpenStreetMap',
    category: 'street',
    type: 'raster',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, ODbL 1.0',
    maxZoom: 19,
  },
  {
    id: 'esri-world-imagery',
    name: 'Esri World Imagery',
    category: 'satellite',
    type: 'raster',
    url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 22,
  },
  {
    id: 'esri-world-topo',
    name: 'Esri World Topo',
    category: 'topographic',
    type: 'raster',
    url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS',
    maxZoom: 19,
  },
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    category: 'topographic',
    type: 'raster',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    minZoom: 3,
  },
  {
    id: 'usgs-imagery',
    name: 'USGS Imagery',
    category: 'satellite',
    type: 'raster',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: 'U.S. Department of the Interior | U.S. Geological Survey',
    maxZoom: 20,
    minZoom: 9,
  },
  {
    id: 'carto-voyager',
    name: 'CartoDB Voyager',
    category: 'street',
    type: 'style',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 18,
  },
];

/** Default basemap id — matches the existing AreaMap hardcoded style. */
export const DEFAULT_BASEMAP_ID = 'carto-positron' as const;

/**
 * Find a basemap by id, falling back gracefully:
 * 1. Exact match by id
 * 2. Default basemap (carto-positron) in the catalog
 * 3. First entry in the catalog (ensures we never throw)
 */
export function findBasemap(
  id: string | undefined,
  catalog: ImageryBasemap[] = BASEMAP_CATALOG,
): ImageryBasemap {
  if (id) {
    const found = catalog.find((b) => b.id === id);
    if (found) return found;
  }

  // Try the global default
  const defaultBasemap = catalog.find((b) => b.id === DEFAULT_BASEMAP_ID);
  if (defaultBasemap) return defaultBasemap;

  // Fall back to first entry — ensures custom catalogs never crash
  if (catalog.length > 0) return catalog[0]!;

  throw new Error('Basemap catalog is empty');
}
