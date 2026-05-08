import * as turf from '@turf/turf';
import type {
  Feature,
  FeatureCollection,
  GeoJSON,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson';
import polygonClipping from 'polygon-clipping';

import type {
  CalculationParams,
  CalculationResult,
  MethodDescriptor,
} from './types';

type PolygonClippingGeom =
  | polygonClipping.Polygon
  | polygonClipping.MultiPolygon;

// turf's internal feature/featureCollection use the same structure as geojson types
// but TypeScript resolves them differently; cast via unknown where needed.
function asTurf<T>(v: unknown): T {
  return v as T;
}

export function extractPoints(geojson: unknown): Feature<Point>[] {
  if (geojson === null || typeof geojson !== 'object') return [];
  const g = geojson as GeoJSON;

  if (g.type === 'FeatureCollection') {
    const fc = g as FeatureCollection;
    return fc.features
      .filter((f) => f.geometry !== null)
      .flatMap((feature) => explodePointFeature(feature));
  }

  if (g.type === 'Feature') {
    return explodePointFeature(geojson as Feature);
  }

  if (g.type === 'Point' || g.type === 'MultiPoint') {
    return explodePointFeature({
      type: 'Feature',
      properties: {},
      geometry: g,
    });
  }

  return [];
}

export function calculateAllMethods(
  points: Feature<Point>[],
  params: CalculationParams,
): MethodDescriptor[] {
  const fc: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: points,
  };

  const methods: Array<{
    id: string;
    progress: string;
    run: () => CalculationResult;
  }> = [
    {
      id: 'observed',
      progress: 'Calculating observed footprint...',
      run: () => buildObservedResult(fc, params.observedBufferMeters),
    },
    {
      id: 'connectivity10',
      progress: `Calculating ${params.connectivity10Km} km connectivity...`,
      run: () =>
        buildConnectivityResult(
          'connectivity10',
          `${params.connectivity10Km} km connectivity`,
          fc,
          params.connectivity10Km,
        ),
    },
    {
      id: 'connectivity30',
      progress: `Calculating ${params.connectivity30Km} km connectivity...`,
      run: () =>
        buildConnectivityResult(
          'connectivity30',
          `${params.connectivity30Km} km connectivity`,
          fc,
          params.connectivity30Km,
        ),
    },
    {
      id: 'clusterHull',
      progress: 'Calculating cluster + concave hull...',
      run: () => buildClusterHullResult(fc, params),
    },
    {
      id: 'grid',
      progress: 'Calculating occupied grid...',
      run: () => buildGridResult(fc, params.gridCellKm),
    },
  ];

  return methods;
}

function explodePointFeature(feature: Feature): Feature<Point>[] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Point') {
    const coordinates = validLonLat(geometry.coordinates);
    if (!coordinates) return [];
    return [
      {
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: {
          type: 'Point',
          coordinates,
        },
      },
    ];
  }
  if (geometry.type === 'MultiPoint') {
    return geometry.coordinates.flatMap((coordinates, index) => {
      const validCoordinates = validLonLat(coordinates);
      if (!validCoordinates) return [];
      return [
        {
          type: 'Feature' as const,
          properties: {
            ...(feature.properties ?? {}),
            multipointIndex: index,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: validCoordinates,
          },
        },
      ];
    });
  }
  return [];
}

function validLonLat(coordinates: unknown): [number, number] | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180) return null;
  if (lat < -90 || lat > 90) return null;
  return [lon, lat];
}

function buildObservedResult(
  points: FeatureCollection<Point>,
  bufferMeters: number,
): CalculationResult {
  const radiusKm = bufferMeters / 1000;
  const geometry = buildBufferedUnionGeometry(points, radiusKm);
  return resultFromGeometry({
    id: 'observed',
    label: `${bufferMeters} m observed footprint`,
    description: 'Buffers each point and dissolves all overlaps.',
    geometry,
    metadata: {
      pointCount: points.features.length,
      bufferMeters,
    },
  });
}

function buildConnectivityResult(
  id: string,
  label: string,
  points: FeatureCollection<Point>,
  connectDistanceKm: number,
): CalculationResult {
  const radiusKm = connectDistanceKm / 2;
  const geometry = buildBufferedUnionGeometry(points, radiusKm);
  return resultFromGeometry({
    id,
    label,
    description: `Implements the rule "points within ${connectDistanceKm} km connect" using dissolved ${radiusKm} km buffers.`,
    geometry,
    metadata: {
      pointCount: points.features.length,
      connectDistanceKm,
      radiusKm,
    },
  });
}

function buildClusterHullResult(
  points: FeatureCollection<Point>,
  params: CalculationParams,
): CalculationResult {
  const turfFc = toTurfFc(points);
  const clustered = turf.clustersDbscan(turfFc, params.clusterDistanceKm, {
    units: 'kilometers',
    minPoints: 1,
  });

  const groups = new Map<string | number, Feature[]>();
  clustered.features.forEach((feature, index) => {
    const clusterId = getClusterId(asTurf<Feature>(feature), index);
    if (!groups.has(clusterId)) groups.set(clusterId, []);
    groups.get(clusterId)!.push(asTurf<Feature>(feature));
  });

  const hullGeometries: (Polygon | MultiPolygon)[] = [];

  for (const [clusterId, features] of groups.entries()) {
    const turfFeatures = features.map((f) =>
      asTurf<Parameters<typeof turf.featureCollection>[0][number]>(f),
    );
    const fc = turf.featureCollection(turfFeatures);
    let geometry: Polygon | MultiPolygon | null = null;

    if (features.length >= 3) {
      const hull = turf.concave(
        asTurf<Parameters<typeof turf.concave>[0]>(fc),
        {
          maxEdge: params.hullMaxEdgeKm,
          units: 'kilometers',
        },
      );
      const hullGeom = hull?.geometry;
      if (
        hullGeom &&
        (hullGeom.type === 'Polygon' || hullGeom.type === 'MultiPolygon')
      ) {
        geometry = asTurf<Polygon | MultiPolygon>(hullGeom);
      }
    }

    if (!geometry) {
      const buffered = features
        .map((feature) =>
          bufferPointFeature(
            asTurf<Feature<Point>>(feature),
            params.hullFallbackBufferKm,
          ),
        )
        .filter((g): g is Polygon => g !== null);
      geometry = unionPolygons(buffered);
    }

    if (!geometry) {
      throw new Error(`Cluster ${String(clusterId)} did not produce a polygon`);
    }

    hullGeometries.push(geometry);
  }

  const geometry = unionPolygons(hullGeometries);
  if (!geometry) throw new Error('Cluster hull did not produce a polygon');

  return resultFromGeometry({
    id: 'clusterHull',
    label: `${params.clusterDistanceKm} km clusters + concave hull`,
    description: `Clusters points with DBSCAN at ${params.clusterDistanceKm} km, then applies a concave hull with ${params.hullMaxEdgeKm} km max edge. Small clusters fall back to buffered islands.`,
    geometry,
    metadata: {
      pointCount: points.features.length,
      clusterCount: groups.size,
      clusterDistanceKm: params.clusterDistanceKm,
      hullMaxEdgeKm: params.hullMaxEdgeKm,
      hullFallbackBufferKm: params.hullFallbackBufferKm,
    },
  });
}

function buildBufferedUnionGeometry(
  points: FeatureCollection<Point>,
  radiusKm: number,
): Polygon | MultiPolygon {
  const groups = groupPointsByOverlap(points, radiusKm * 2);
  const geometries: (Polygon | MultiPolygon)[] = [];

  for (const features of groups.values()) {
    if (features.length === 1) {
      const g = bufferPointFeature(features[0]!, radiusKm);
      if (g) geometries.push(g);
      continue;
    }

    const buffered = features
      .map((feature) => bufferPointFeature(feature, radiusKm))
      .filter((g): g is Polygon => g !== null);
    const union = unionPolygons(buffered);
    if (union) geometries.push(union);
  }

  return fromPolygonClippingGeometry(mergePolygonSets(geometries));
}

function buildGridResult(
  points: FeatureCollection<Point>,
  gridCellKm: number,
): CalculationResult {
  if (!points.features.length) {
    throw new Error('No points were available for occupied grid calculation');
  }
  if (!Number.isFinite(gridCellKm) || gridCellKm <= 0) {
    throw new Error('Grid cell size must be greater than zero');
  }

  const turfFc = toTurfFc(points);
  const bbox = turf.bbox(turfFc);
  const [minLng, minLat] = bbox;
  const minXY = projectMercator(minLng!, minLat!);
  const cellSizeMeters = gridCellKm * 1000;
  const occupiedByCell = new Map<string, number>();

  for (const feature of points.features) {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;

    const [lng, lat] = coordinates as [number, number];
    const { x, y } = projectMercator(lng, lat);
    const col = Math.max(0, Math.floor((x - minXY.x) / cellSizeMeters));
    const row = Math.max(0, Math.floor((y - minXY.y) / cellSizeMeters));
    const key = `${col}:${row}`;
    occupiedByCell.set(key, (occupiedByCell.get(key) ?? 0) + 1);
  }

  const occupied = Array.from(occupiedByCell.entries(), ([key, pointCount]) => {
    const parts = key.split(':');
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    const x0 = minXY.x + col * cellSizeMeters;
    const y0 = minXY.y + row * cellSizeMeters;
    const x1 = x0 + cellSizeMeters;
    const y1 = y0 + cellSizeMeters;
    return turf.polygon(
      [
        [
          unprojectMercator(x0, y0),
          unprojectMercator(x1, y0),
          unprojectMercator(x1, y1),
          unprojectMercator(x0, y1),
          unprojectMercator(x0, y0),
        ],
      ],
      { pointCount },
    );
  });

  if (!occupied.length) {
    throw new Error('No occupied cells were found for the current grid size');
  }

  const withLayerId = occupied.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      layerId: 'grid',
    },
  }));

  const turfFcResult = turf.featureCollection(withLayerId);

  return {
    id: 'grid',
    label: `${gridCellKm} km occupied grid`,
    description: `Marks every ${gridCellKm} km square containing at least one point.`,
    featureCollection: asTurf<FeatureCollection>(turfFcResult),
    previewFeatureCollection: asTurf<FeatureCollection>(turfFcResult),
    areaM2: occupied.reduce((total, cell) => total + turf.area(cell), 0),
    metadata: {
      occupiedCells: occupied.length,
      gridCellKm,
      pointCount: points.features.length,
    },
  };
}

type TurfPointFc = Parameters<typeof turf.clustersDbscan>[0];

function toTurfFc(points: FeatureCollection<Point>): TurfPointFc {
  return asTurf<TurfPointFc>(
    turf.featureCollection(
      points.features.map((f) =>
        turf.point(
          f.geometry.coordinates as [number, number],
          f.properties ?? {},
        ),
      ),
    ),
  );
}

function getClusterId(feature: Feature, index: number): string | number {
  const props = feature.properties ?? {};
  const cluster = (props as Record<string, unknown>)['cluster'];
  if (typeof cluster === 'number') return cluster;
  return `noise-${index}`;
}

// Feature with any geometry, used for turf function compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTurfFeature = Feature<any, any>;

function resultFromGeometry({
  id,
  label,
  description,
  geometry,
  metadata,
}: {
  id: string;
  label: string;
  description: string;
  geometry: Polygon | MultiPolygon;
  metadata: Record<string, unknown>;
}): CalculationResult {
  const feature: Feature<Polygon | MultiPolygon> = {
    type: 'Feature',
    properties: {
      layerId: id,
      ...metadata,
    },
    geometry,
  };

  const turfFeature = feature as unknown as AnyTurfFeature;
  const preview = buildPreviewFeature(turfFeature);

  return {
    id,
    label,
    description,
    featureCollection: asTurf<FeatureCollection>(
      turf.featureCollection([turfFeature]),
    ),
    previewFeatureCollection: asTurf<FeatureCollection>(
      turf.featureCollection([preview]),
    ),
    areaM2: turf.area(turfFeature),
    metadata,
  };
}

function buildPreviewFeature(feature: AnyTurfFeature): AnyTurfFeature {
  if (!feature?.geometry) return feature;

  try {
    return (
      turf.simplify(feature, {
        tolerance: 0.005,
        highQuality: false,
        mutate: false,
      }) ?? feature
    );
  } catch {
    return feature;
  }
}

function unionPolygons(
  geometries: (Polygon | MultiPolygon)[],
): Polygon | MultiPolygon | null {
  if (!geometries.length) return null;
  return fromPolygonClippingGeometry(mergePolygonSets(geometries));
}

function mergePolygonSets(
  geometries: (Polygon | MultiPolygon)[],
): PolygonClippingGeom | null {
  const queue: PolygonClippingGeom[] = geometries
    .filter(Boolean)
    .map((geometry) => toPolygonClippingGeometry(geometry));

  if (!queue.length) return null;

  let current = [...queue];
  while (current.length > 1) {
    const nextQueue: PolygonClippingGeom[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]!;
      const right = current[index + 1];
      if (right) {
        nextQueue.push(polygonClipping.union(left, right));
      } else {
        nextQueue.push(left);
      }
    }
    current = nextQueue;
  }

  return current[0] ?? null;
}

function toPolygonClippingGeometry(
  geometry: Polygon | MultiPolygon,
): PolygonClippingGeom {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates] as unknown as polygonClipping.Polygon;
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates as unknown as polygonClipping.MultiPolygon;
  }
  throw new Error(`Unsupported geometry type for union`);
}

function fromPolygonClippingGeometry(
  geometry: PolygonClippingGeom | null,
): Polygon | MultiPolygon {
  if (!geometry?.length) throw new Error('Union did not produce a polygon');
  if (geometry.length === 1) {
    return {
      type: 'Polygon',
      coordinates: geometry[0] as Polygon['coordinates'],
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry as unknown as MultiPolygon['coordinates'],
  };
}

function projectMercator(lng: number, lat: number): { x: number; y: number } {
  const earthRadius = 6378137;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = earthRadius * degreesToRadians(lng);
  const y =
    earthRadius *
    Math.log(Math.tan(Math.PI / 4 + degreesToRadians(clampedLat) / 2));
  return { x, y };
}

function unprojectMercator(x: number, y: number): [number, number] {
  const earthRadius = 6378137;
  const lng = radiansToDegrees(x / earthRadius);
  const lat = radiansToDegrees(
    2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2,
  );
  return [lng, lat];
}

function degreesToRadians(value: number): number {
  return value * (Math.PI / 180);
}

function radiansToDegrees(value: number): number {
  return value * (180 / Math.PI);
}

function groupPointsByOverlap(
  points: FeatureCollection<Point>,
  connectDistanceKm: number,
): Map<string | number, Feature<Point>[]> {
  const turfFc = toTurfFc(points);
  const clustered = turf.clustersDbscan(turfFc, connectDistanceKm, {
    units: 'kilometers',
    minPoints: 1,
  });

  const groups = new Map<string | number, Feature<Point>[]>();
  clustered.features.forEach((feature, index) => {
    const clusterId = getClusterId(asTurf<Feature>(feature), index);
    if (!groups.has(clusterId)) groups.set(clusterId, []);
    groups.get(clusterId)!.push(asTurf<Feature<Point>>(feature));
  });

  return groups;
}

function bufferPointFeature(
  feature: Feature<Point>,
  radiusKm: number,
): Polygon | null {
  // Cast to any to bridge geojson types with @turf/buffer's overloaded signatures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = turf.buffer(feature as any, radiusKm, {
    units: 'kilometers',
    steps: 4,
  }) as Feature<Polygon | MultiPolygon> | undefined;
  const g = result?.geometry;
  return g && g.type === 'Polygon' ? g : null;
}
