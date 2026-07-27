export function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Returns true only when BOTH lat and lon are exactly 0.
 *
 * This is used to exclude observations at the (0, 0) "null island"
 * coordinate, which is almost always a sentinel for "no location" rather
 * than a real observation. A real observation on the equator
 * (`lat: 0, lon: -60`) or on the prime meridian (`lat: 45, lon: 0`) is
 * NOT a zero-zero coordinate and must be kept.
 */
export function isZeroZeroCoord(
  lat: number | undefined,
  lon: number | undefined,
): boolean {
  return lat === 0 && lon === 0;
}
