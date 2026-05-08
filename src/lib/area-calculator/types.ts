import type { Feature, FeatureCollection, Point } from 'geojson';

export type { Feature, FeatureCollection, Point };

export interface CalculationParams {
  observedBufferMeters: number;
  connectivity10Km: number;
  connectivity30Km: number;
  clusterDistanceKm: number;
  hullMaxEdgeKm: number;
  hullFallbackBufferKm: number;
  gridCellKm: number;
}

export interface CalculationResult {
  id: string;
  label: string;
  description: string;
  featureCollection: FeatureCollection;
  previewFeatureCollection: FeatureCollection;
  areaM2: number;
  metadata: Record<string, unknown>;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  params: CalculationParams;
}

export interface MethodDescriptor {
  id: string;
  label: string;
  description: string;
  featureCollection: FeatureCollection;
  previewFeatureCollection: FeatureCollection;
  areaM2: number;
  metadata: Record<string, unknown>;
}

export type WorkerInMessage = {
  type: 'calculate';
  requestId: string;
  geojson: unknown;
  params: CalculationParams;
};

export type WorkerOutMessage =
  | { type: 'progress'; requestId: string; methodId: string; message: string }
  | { type: 'result'; requestId: string; result: MethodDescriptor }
  | { type: 'methodError'; requestId: string; methodId: string; error: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; error: string };
