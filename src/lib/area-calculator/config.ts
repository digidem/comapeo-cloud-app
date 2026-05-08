import type { CalculationParams, Preset } from './types';

export const DEFAULTS: CalculationParams = {
  observedBufferMeters: 100,
  connectivity10Km: 10,
  connectivity30Km: 30,
  clusterDistanceKm: 30,
  hullMaxEdgeKm: 30,
  hullFallbackBufferKm: 15,
  gridCellKm: 5,
};

export const PARAM_FIELDS: (keyof CalculationParams)[] = [
  'observedBufferMeters',
  'connectivity10Km',
  'connectivity30Km',
  'clusterDistanceKm',
  'hullMaxEdgeKm',
  'hullFallbackBufferKm',
  'gridCellKm',
];

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'balanced',
    label: 'Balanced Comparison',
    description:
      'Keeps the original comparison set for direct side-by-side evaluation.',
    params: { ...DEFAULTS },
  },
  {
    id: 'footprint',
    label: 'Observed Footprint',
    description:
      'Optimized to emphasize the direct observation buffer and tighter derived areas.',
    params: {
      observedBufferMeters: 100,
      connectivity10Km: 5,
      connectivity30Km: 10,
      clusterDistanceKm: 10,
      hullMaxEdgeKm: 10,
      hullFallbackBufferKm: 2,
      gridCellKm: 2,
    },
  },
  {
    id: 'connectivity',
    label: '10 km Connectivity',
    description:
      'Prioritizes near-neighbor reach while keeping hull and grid outputs moderate.',
    params: {
      observedBufferMeters: 100,
      connectivity10Km: 10,
      connectivity30Km: 20,
      clusterDistanceKm: 10,
      hullMaxEdgeKm: 12,
      hullFallbackBufferKm: 5,
      gridCellKm: 3,
    },
  },
  {
    id: 'grid',
    label: '5 km Grid',
    description:
      'Centers the analysis on occupied grid cells for reporting-style coverage maps.',
    params: {
      observedBufferMeters: 100,
      connectivity10Km: 10,
      connectivity30Km: 30,
      clusterDistanceKm: 20,
      hullMaxEdgeKm: 20,
      hullFallbackBufferKm: 5,
      gridCellKm: 5,
    },
  },
];
