import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeoJsonOverlay } from '@/screens/MapScreen/OverlayLayers';
import { OverlayLayers } from '@/screens/MapScreen/OverlayLayers';

// Mock react-map-gl/maplibre Source and Layer to capture props without a real map.
const layerProps: Array<Record<string, unknown>> = [];

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div data-testid={`mock-source-${id}`}>{children}</div>
  ),
  Layer: (props: Record<string, unknown>) => {
    layerProps.push(props);
    return <div data-testid={`mock-layer-${props.id}`} />;
  },
}));

function makeOverlay(overrides: Partial<GeoJsonOverlay> = {}): GeoJsonOverlay {
  return {
    id: 'ov1',
    fileName: 'test.geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    },
    visible: true,
    ...overrides,
  };
}

describe('OverlayLayers', () => {
  beforeEach(() => {
    layerProps.length = 0;
  });

  it('renders a GeoJSON source for the overlay', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    expect(screen.getByTestId('mock-source-overlay-src-ov1')).toBeTruthy();
  });

  it('creates a circle layer for points', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    const pointsLayer = layerProps.find((p) => p.id === 'ov1-points');
    expect(pointsLayer).toBeDefined();
    expect(pointsLayer!.type).toBe('circle');
    expect(pointsLayer!.filter).toEqual(['in', '$type', 'Point']);
  });

  it('creates a line layer for lines', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    const linesLayer = layerProps.find((p) => p.id === 'ov1-lines');
    expect(linesLayer).toBeDefined();
    expect(linesLayer!.type).toBe('line');
    expect(linesLayer!.filter).toEqual(['in', '$type', 'LineString']);
  });

  it('creates a fill layer for polygons', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    const fillLayer = layerProps.find((p) => p.id === 'ov1-polygon-fill');
    expect(fillLayer).toBeDefined();
    expect(fillLayer!.type).toBe('fill');
    expect(fillLayer!.filter).toEqual(['in', '$type', 'Polygon']);
  });

  it('creates an outline line layer for polygons', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    const outlineLayer = layerProps.find((p) => p.id === 'ov1-polygon-outline');
    expect(outlineLayer).toBeDefined();
    expect(outlineLayer!.type).toBe('line');
    expect(outlineLayer!.filter).toEqual(['in', '$type', 'Polygon']);
  });

  it('sets all layers to visible when overlay.visible is true', () => {
    render(<OverlayLayers overlay={makeOverlay({ visible: true })} />);
    for (const layer of layerProps) {
      expect(layer.layout).toEqual({ visibility: 'visible' });
    }
  });

  it('sets all layers to none when overlay.visible is false', () => {
    render(<OverlayLayers overlay={makeOverlay({ visible: false })} />);
    for (const layer of layerProps) {
      expect(layer.layout).toEqual({ visibility: 'none' });
    }
  });

  it('renders four layers total (points, lines, polygon-fill, polygon-outline)', () => {
    render(<OverlayLayers overlay={makeOverlay()} />);
    expect(layerProps).toHaveLength(4);
  });
});
