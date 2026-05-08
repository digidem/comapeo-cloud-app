import type { FeatureCollection } from 'geojson';

export function exportFeatureCollection(
  fc: FeatureCollection,
  filename: string,
): void {
  const json = JSON.stringify(fc, null, 2);
  const blob = new Blob([json], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
