import type { FeatureCollection } from 'geojson';

import { downloadText } from '@/lib/file-export';

export function exportFeatureCollection(
  fc: FeatureCollection,
  filename: string,
): void {
  const json = JSON.stringify(fc, null, 2);
  downloadText(json, filename, 'application/geo+json');
}
