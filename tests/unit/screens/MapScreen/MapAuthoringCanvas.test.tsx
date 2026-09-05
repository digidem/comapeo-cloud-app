import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { RefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';

import { findBasemap } from '@/lib/map/basemaps';
import type { GeoJsonOverlay } from '@/lib/map/geojson-overlays';
import { MapAuthoringCanvas } from '@/screens/MapScreen/MapAuthoringCanvas';

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const mapCanvas = document.createElement('canvas');
const layerProps: Array<Record<string, unknown>> = [];
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
  Layer: (props: Record<string, unknown>) => {
    layerProps.push(props);
    return (
      <div
        data-testid={`mock-layer-${String(props.id)}`}
        data-type={props.type}
      />
    );
  },
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
  beforeEach(() => {
    layerProps.length = 0;
  });

  it('renders mixed geometry from one source with filtered family layers', () => {
    renderCanvas();

    expect(
      screen.getByTestId('mock-source-reference-overlay-mixed'),
    ).toBeInTheDocument();
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

    expect(
      layerProps.find(
        (props) => props.id === 'reference-overlay-mixed-points-circle',
      )?.filter,
    ).toEqual(['in', '$type', 'Point']);
    expect(
      layerProps.find(
        (props) => props.id === 'reference-overlay-mixed-lines-line',
      )?.filter,
    ).toEqual(['in', '$type', 'LineString']);
    expect(
      layerProps.find(
        (props) => props.id === 'reference-overlay-mixed-polygons-fill',
      )?.filter,
    ).toEqual(['in', '$type', 'Polygon']);
    expect(
      layerProps
        .filter((props) =>
          String(props.id).startsWith('reference-overlay-mixed-'),
        )
        .map((props) => props.id),
    ).toEqual([
      'reference-overlay-mixed-polygons-fill',
      'reference-overlay-mixed-polygons-outline',
      'reference-overlay-mixed-lines-line',
      'reference-overlay-mixed-points-circle',
    ]);
  });

  it('keeps the source mounted and hides all layers when an overlay is hidden', () => {
    renderCanvas([{ ...mixedOverlay, visible: false }]);

    expect(
      screen.getByTestId('mock-source-reference-overlay-mixed'),
    ).toBeInTheDocument();
    const overlayLayers = layerProps.filter((props) =>
      String(props.id).startsWith('reference-overlay-mixed-'),
    );
    expect(overlayLayers).toHaveLength(4);
    for (const layer of overlayLayers) {
      expect(layer.layout).toEqual({ visibility: 'none' });
    }
  });

  it('accepts GeoJSON files dropped on the map without changing normal pointer gestures', () => {
    const { onOverlayFilesDrop } = renderCanvas([]);
    const file = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'point.geojson',
      { type: 'application/geo+json' },
    );
    const region = screen.getByRole('region', { name: 'Map authoring canvas' });
    expect(region).toHaveClass('isolate');

    fireEvent.dragOver(region, {
      dataTransfer: { types: ['Files'], files: [file], dropEffect: 'none' },
    });
    fireEvent.drop(region, {
      dataTransfer: { types: ['Files'], files: [file] },
    });

    expect(onOverlayFilesDrop).toHaveBeenCalledWith([file]);
  });

  it('does not swallow non-file drop events', () => {
    const { onOverlayFilesDrop } = renderCanvas([]);
    const region = screen.getByRole('region', { name: 'Map authoring canvas' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { types: ['text/plain'], files: [] },
    });

    fireEvent(region, dropEvent);

    expect(dropEvent.defaultPrevented).toBe(false);
    expect(onOverlayFilesDrop).not.toHaveBeenCalled();
  });

  it('clears the drop affordance when a file drag ends without usable files', () => {
    const { onOverlayFilesDrop } = renderCanvas([]);
    const region = screen.getByRole('region', { name: 'Map authoring canvas' });

    fireEvent.dragOver(region, {
      dataTransfer: { types: ['Files'], files: [], dropEffect: 'none' },
    });
    expect(
      screen.getByText('Drop GeoJSON files to add reference data'),
    ).toBeInTheDocument();

    fireEvent.drop(region, {
      dataTransfer: { types: ['Files'], files: [] },
    });

    expect(
      screen.queryByText('Drop GeoJSON files to add reference data'),
    ).not.toBeInTheDocument();
    expect(onOverlayFilesDrop).not.toHaveBeenCalled();
  });
});
