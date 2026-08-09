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

/**
 * Detect if a set of longitudes spans the antimeridian.
 *
 * When coordinates are already normalized to [-180, 180], a tight cluster of points
 * crossing the antimeridian (e.g., 179 and -179) will have a small angular span
 * but straddle the ±180 boundary. This function uses the "largest gap" method
 * on normalized [0, 360) coordinates to detect this case.
 *
 * Algorithm:
 * 1. Normalize all longitudes to [0, 360)
 * 2. Find the largest gap between consecutive points (including wrap-around)
 * 3. If largest gap > 180°, points are clustered in the complement (< 180°)
 * 4. If the largest gap is the wrap-around gap, the cluster is contiguous;
 *    check if it crosses 180° (the antimeridian in normalized space)
 * 5. If the largest gap is internal, the cluster wraps around 0/360 (prime meridian),
 *    which means it does NOT cross the antimeridian.
 */
export function spansAntimeridian(lngs: number[]): boolean {
  if (lngs.length < 2) return false;

  // Normalize to [0, 360)
  const normalized = lngs.map((lng) => ((lng % 360) + 360) % 360);
  const sorted = [...normalized].sort((a, b) => a - b);

  let maxGap = 0;
  let maxGapIndex = -1; // -1 means wrap gap

  // Check gaps between consecutive points
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = sorted[i - 1];
    if (current === undefined || prev === undefined) continue;
    const gap = current - prev;
    if (gap > maxGap) {
      maxGap = gap;
      maxGapIndex = i - 1;
    }
  }

  // Check the wrap-around gap
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return false;
  const wrapGap = first + 360 - last;
  if (wrapGap > maxGap) {
    maxGap = wrapGap;
    maxGapIndex = -1;
  }

  // If the largest gap <= 180, points are spread out (not a tight cluster)
  if (maxGap <= 180) return false;

  // If the max gap is the wrap gap, the cluster is contiguous in [0, 360)
  // Check if this contiguous cluster crosses the antimeridian (180°)
  // Use strict comparison: cluster exactly touching 180° on one side is NOT antimeridian-spanning
  if (maxGapIndex === -1) {
    const clusterMin = sorted[0] ?? 0;
    const clusterMax = sorted[sorted.length - 1] ?? 0;
    return clusterMin < 180 && clusterMax > 180;
  }

  // If max gap is internal, the cluster wraps around 0/360 (prime meridian),
  // not the antimeridian (which is at 180° in normalized space)
  return false;
}

const MIN_BBOX_SPAN = 0.01;

/**
 * Finalize a bbox from raw coordinates.
 * Handles antimeridian crossing, minimum span, and latitude clamping.
 * Returns the finalized bbox or null if invalid.
 */
export function finalizeBbox(
  lngs: number[],
  lats: number[],
): [number, number, number, number] | null {
  // Check for antimeridian crossing
  if (spansAntimeridian(lngs)) {
    // Shift longitudes by adding 360 to negative values, then compute bbox
    const shiftedLngs = lngs.map((lng) => (lng < 0 ? lng + 360 : lng));
    const shiftedLats = lats;
    const shiftedBbox: [number, number, number, number] = [
      Math.min(...shiftedLngs),
      Math.min(...shiftedLats),
      Math.max(...shiftedLngs),
      Math.max(...shiftedLats),
    ];
    // Apply minimum span
    const finalBbox: [number, number, number, number] = [
      shiftedBbox[0],
      shiftedBbox[1],
      shiftedBbox[2] - shiftedBbox[0] < MIN_BBOX_SPAN
        ? shiftedBbox[0] + MIN_BBOX_SPAN
        : shiftedBbox[2],
      shiftedBbox[3] - shiftedBbox[1] < MIN_BBOX_SPAN
        ? shiftedBbox[1] + MIN_BBOX_SPAN
        : shiftedBbox[3],
    ];
    // Validate latitude bounds
    const clampedBbox = clampBboxLatitude(finalBbox);
    if (clampedBbox[1] >= clampedBbox[3] || clampedBbox[0] >= clampedBbox[2]) {
      return null;
    }
    return clampedBbox;
  }

  // Normal case
  const rawBbox: [number, number, number, number] = [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
  // Apply minimum span
  const finalBbox: [number, number, number, number] = [
    rawBbox[0],
    rawBbox[1],
    rawBbox[2] - rawBbox[0] < MIN_BBOX_SPAN
      ? rawBbox[0] + MIN_BBOX_SPAN
      : rawBbox[2],
    rawBbox[3] - rawBbox[1] < MIN_BBOX_SPAN
      ? rawBbox[1] + MIN_BBOX_SPAN
      : rawBbox[3],
  ];
  // Validate latitude bounds
  const clampedBbox = clampBboxLatitude(finalBbox);
  if (clampedBbox[1] >= clampedBbox[3] || clampedBbox[0] >= clampedBbox[2]) {
    return null;
  }
  return clampedBbox;
}
