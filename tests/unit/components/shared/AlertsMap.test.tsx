import { render, screen } from '@tests/mocks/test-utils';
import type { FeatureCollection } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode, RefObject } from 'react';

import type { Alert } from '@/lib/data-layer';

const mockFitBounds = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/components/shared/MapContainer', () => ({
  MapContainer: ({
    children,
    mapContentOverlay,
    onLoad,
    onClick,
    mapRef,
    cursor,
  }: {
    children: ReactNode;
    mapContentOverlay?: ReactNode;
    onLoad?: () => void;
    onClick: (event: {
      features: Array<{ properties: { alertId: string } }>;
      lngLat: { lng: number; lat: number };
    }) => void;
    mapRef: RefObject<{ fitBounds: typeof mockFitBounds } | null>;
    cursor?: string;
  }) => {
    mapRef.current = { fitBounds: mockFitBounds };
    return (
      <div data-testid="map-container" data-cursor={cursor}>
        {children}
        {mapContentOverlay}
        <button type="button" data-testid="load-map" onClick={onLoad}>
          load
        </button>
        <button
          type="button"
          data-testid="click-geometry"
          onClick={() =>
            onClick({
              features: [{ properties: { alertId: 'alert-42' } }],
              lngLat: { lng: -55, lat: -8 },
            })
          }
        >
          geometry
        </button>
        <button
          type="button"
          data-testid="click-map-point"
          onClick={() =>
            onClick({ features: [], lngLat: { lng: -51.25, lat: -3.75 } })
          }
        >
          map point
        </button>
      </div>
    );
  },
}));

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({
    children,
    data,
    id,
  }: {
    children: ReactNode;
    data: FeatureCollection;
    id: string;
  }) => (
    <div data-testid={`${id}-source`} data-features={data.features.length}>
      {children}
    </div>
  ),
  Layer: ({ id, paint }: { id: string; paint?: Record<string, unknown> }) => (
    <div data-testid={id} data-paint={JSON.stringify(paint ?? {})} />
  ),
  Marker: ({
    children,
    longitude,
    latitude,
  }: {
    children: ReactNode;
    longitude: number;
    latitude: number;
  }) => (
    <div
      data-testid="map-marker"
      data-longitude={longitude}
      data-latitude={latitude}
    >
      {children}
    </div>
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

function makeAlert(geometry?: Alert['geometry']): Alert {
  return {
    localId: 'alert-42',
    projectLocalId: 'project-1',
    sourceType: 'local',
    sourceId: 'source-1',
    geometry,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
  };
}

describe('AlertsMap', () => {
  let AlertsMap: typeof import('@/components/shared/AlertsMap/AlertsMap').AlertsMap;

  beforeEach(async () => {
    vi.clearAllMocks();
    AlertsMap = (await import('@/components/shared/AlertsMap/AlertsMap'))
      .AlertsMap;
  });

  it('renders all six supported geometry families through neutral map layers', () => {
    render(
      <AlertsMap
        alerts={[
          makeAlert({ type: 'Point', coordinates: [-55, -8] }),
          {
            ...makeAlert({
              type: 'MultiPoint',
              coordinates: [
                [-56, -8],
                [-57, -9],
              ],
            }),
            localId: 'multi-point',
          },
          {
            ...makeAlert({
              type: 'LineString',
              coordinates: [
                [-60, -3],
                [-61, -4],
              ],
            }),
            localId: 'line',
          },
          {
            ...makeAlert({
              type: 'MultiLineString',
              coordinates: [
                [
                  [-60, -4],
                  [-61, -5],
                ],
                [
                  [-62, -6],
                  [-63, -7],
                ],
              ],
            }),
            localId: 'multi-line',
          },
          {
            ...makeAlert({
              type: 'Polygon',
              coordinates: [
                [
                  [-62, -5],
                  [-63, -5],
                  [-63, -6],
                  [-62, -5],
                ],
              ],
            }),
            localId: 'polygon',
          },
          {
            ...makeAlert({
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [-64, -8],
                    [-65, -8],
                    [-65, -9],
                    [-64, -8],
                  ],
                ],
                [
                  [
                    [-66, -10],
                    [-67, -10],
                    [-67, -11],
                    [-66, -10],
                  ],
                ],
              ],
            }),
            localId: 'multi-polygon',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('alerts-source')).toHaveAttribute(
      'data-features',
      '6',
    );
    expect(screen.getByTestId('alert-points')).toBeInTheDocument();
    expect(screen.getByTestId('alert-lines')).toBeInTheDocument();
    expect(screen.getByTestId('alert-polygons')).toBeInTheDocument();
    expect(screen.getByTestId('alert-points')).toHaveAttribute(
      'data-paint',
      expect.stringContaining('"circle-color":"#DC2626"'),
    );
  });

  it('fits the complete valid alert extent when the map initially loads', () => {
    render(
      <AlertsMap
        alerts={[
          makeAlert({
            type: 'MultiPoint',
            coordinates: [
              [-72, -15],
              [-48, 2],
            ],
          }),
        ]}
      />,
    );

    screen.getByTestId('load-map').click();
    expect(mockFitBounds).toHaveBeenCalledWith(
      [
        [-72, -15],
        [-48, 2],
      ],
      expect.objectContaining({ padding: 50, maxZoom: 14 }),
    );
  });

  it('refits when the meaningful alert extent changes after initial load', () => {
    const { rerender } = render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [-60, -3] })]}
      />,
    );

    screen.getByTestId('load-map').click();
    expect(mockFitBounds).toHaveBeenCalledTimes(1);

    rerender(
      <AlertsMap
        alerts={[
          makeAlert({
            type: 'MultiPoint',
            coordinates: [
              [-72, -15],
              [-48, 2],
            ],
          }),
        ]}
      />,
    );

    expect(mockFitBounds).toHaveBeenCalledTimes(2);
    expect(mockFitBounds).toHaveBeenLastCalledWith(
      [
        [-72, -15],
        [-48, 2],
      ],
      expect.objectContaining({ padding: 50, maxZoom: 14 }),
    );
  });

  it('navigates to alert detail when any rendered geometry is clicked', () => {
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [-55, -8] })]}
      />,
    );

    screen.getByTestId('click-geometry').click();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/alerts/$alertId',
      params: { alertId: 'alert-42' },
    });
  });

  it('selects a map point without navigating while point creation is active', () => {
    const onMapPointSelect = vi.fn();
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [-55, -8] })]}
        interactionMode="create-point"
        onMapPointSelect={onMapPointSelect}
      />,
    );

    screen.getByTestId('click-map-point').click();

    expect(onMapPointSelect).toHaveBeenCalledWith([-51.25, -3.75]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('map-container')).toHaveAttribute(
      'data-cursor',
      'crosshair',
    );
  });

  it('treats alert geometry clicks as point placement while creation is active', () => {
    const onMapPointSelect = vi.fn();
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [-55, -8] })]}
        interactionMode="create-point"
        onMapPointSelect={onMapPointSelect}
      />,
    );

    screen.getByTestId('click-geometry').click();

    expect(onMapPointSelect).toHaveBeenCalledWith([-55, -8]);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the inline draft point on the existing alerts map', () => {
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [-55, -8] })]}
        draftPoint={[-51.25, -3.75]}
      />,
    );

    expect(screen.getByTestId('map-marker')).toHaveAttribute(
      'data-longitude',
      '-51.25',
    );
    expect(screen.getByTestId('map-marker')).toHaveAttribute(
      'data-latitude',
      '-3.75',
    );
    expect(screen.getByTestId('alert-draft-point')).toHaveClass(
      'bg-error',
      'border-surface-card',
    );
  });

  it('shows the no-location state while invalid alerts remain absent from the map', () => {
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [999, 999] })]}
      />,
    );

    const emptyState = screen.getByText(
      'No alerts with location to show on the map',
    );
    expect(emptyState).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toContainElement(emptyState);
    expect(screen.queryByTestId('alerts-source')).not.toBeInTheDocument();
  });
});
