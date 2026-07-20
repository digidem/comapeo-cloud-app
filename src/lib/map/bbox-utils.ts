/**
 * Maximum latitude representable in Web Mercator (EPSG:3857). Beyond this,
 * lat2y-style projections divide by cos(90°)=0 and produce NaN/Infinity.
 */
export const WEB_MERCATOR_LAT_LIMIT = 85.051129;

export function clampLatitude(lat: number): number {
  return Math.min(
    Math.max(lat, -WEB_MERCATOR_LAT_LIMIT),
    WEB_MERCATOR_LAT_LIMIT,
  );
}

/** Clamp the south/north components of a bbox to the Web Mercator lat range. */
export function clampBboxLatitude(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  const [west, south, east, north] = bbox;
  return [west, clampLatitude(south), east, clampLatitude(north)];
}

/**
 * True when any raw (unwrapped) corner longitude falls outside ±180°.
 *
 * Corners sourced from a single continuous map projection (e.g. drag-to-draw
 * or a pan-under-frame selection) never wrap mid-gesture — each lng is a
 * continuous offset from the map's current center. A value outside ±180°
 * means the gesture crossed the antimeridian, where naively wrapping each
 * corner into [-180, 180) and taking min/max would flip a narrow selection
 * into an inverted, near-global bbox.
 */
export function crossesAntimeridian(lngs: number[]): boolean {
  return lngs.some((lng) => lng < -180 || lng > 180);
}
