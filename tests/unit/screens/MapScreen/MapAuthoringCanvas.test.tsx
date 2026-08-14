import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { RefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';

import { findBasemap } from '@/lib/map/basemaps';
import type { GeoJsonOverlay } from '@/lib/map/geojson-overlays';
import { MapAuthoringCanvas } from '@/screens/MapScreen/MapAuthoringCanvas';

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const mapCanvas = document.createElement('canvas');
const mapHandle = {
  getMap: () => ({
    getCanvas: () => mapCanvas,
    on: vi.fn(),
    off: vi.fn(),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    scrollZoom: { enable: vi.fn(), disable: vi.fn() },
  }),
  fitBounds: vi.fn(),
};

vi.mock('react-map-gl/maplibre', () => ({
  default: React.forwardRef(function MockMap(
    props: Record<string, unknown>,
    ref: React.ForwardedRef<typeof mapHandle>,
  ) {
    React.useImperativeHandle(ref, () => mapHandle);
    return (
      <div data-testid="mock-map">{props.children as React.ReactNode}</div>
    );
  }),
  Source: (props: Record<string, unknown>) => (
    <div data-testid={`mock-source-${String(props.id)}`}>
      {props.children as React.ReactNode}
    </div>
  ),
  Layer: (props: Record<string, unknown>) => (
    <div
      data-testid={`mock-layer-${String(props.id)}`}
      data-type={props.type}
    />
  ),
  AttributionControl: () => null,
}));

const mixedOverlay: GeoJsonOverlay = {
  id: 'mixed',
  name: 'mixed.geojson',
  visible: true,
  data: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: null,
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [-60, -3],
            [-59, -2],
          ],
        },
      },
      {
        type: 'Feature',
        properties: null,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-60, -3],
            [-59, -2],
          ],
        },
      },
      {
        type: 'Feature',
        properties: null,
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -4],
              ],
            ],
          ],
        },
      },
    ],
  },
};

function renderCanvas(overlays: GeoJsonOverlay[] = [mixedOverlay]) {
  const mapRef = { current: null } as RefObject<MapRef | null>;
  const onOverlayFilesDrop = vi.fn();
  render(
    <MapAuthoringCanvas
      basemap={findBasemap('carto-positron')}
      bbox={null}
      mapRef={mapRef}
      overlays={overlays}
      onOverlayFilesDrop={onOverlayFilesDrop}
    />,
  );
  return { onOverlayFilesDrop };
}

describe('MapAuthoringCanvas reference overlays', () => {
  it('renders point, line, and polygon families with the appropriate MapLibre layers', () => {
    renderCanvas();

    expect(
      screen.getByTestId('mock-layer-reference-overlay-mixed-points-circle'),
    ).toHaveAttribute('data-type', 'circle');
    expect(
      screen.getByTestId('mock-layer-reference-overlay-mixed-lines-line'),
    ).toHaveAttribute('data-type', 'line');
    expect(
      screen.getByTestId('mock-layer-reference-overlay-mixed-polygons-fill'),
    ).toHaveAttribute('data-type', 'fill');
    expect(
      screen.getByTestId('mock-layer-reference-overlay-mixed-polygons-outline'),
    ).toHaveAttribute('data-type', 'line');
  });

  it('does not render sources for hidden overlays', () => {
    renderCanvas([{ ...mixedOverlay, visible: false }]);
    expect(
      screen.queryByTestId('mock-source-reference-overlay-mixed-points'),
    ).not.toBeInTheDocument();
  });

  it('accepts GeoJSON files dropped on the map without changing normal pointer gestures', () => {
    const { onOverlayFilesDrop } = renderCanvas([]);
    const file = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'point.geojson',
      { type: 'application/geo+json' },
    );
    const region = screen.getByRole('region', { name: 'Map authoring canvas' });

    fireEvent.dragOver(region, {
      dataTransfer: { types: ['Files'], files: [file], dropEffect: 'none' },
    });
    fireEvent.drop(region, {
      dataTransfer: { types: ['Files'], files: [file] },
    });

    expect(onOverlayFilesDrop).toHaveBeenCalledWith([file]);
  });
});
