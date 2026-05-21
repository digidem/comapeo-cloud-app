/**
 * Mock for geojson-export used by HomeScreen.
 */
export function exportFeatureCollection(_fc: unknown): string {
  return JSON.stringify({ type: 'FeatureCollection', features: [] });
}
