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
    onLoad,
    onClick,
    mapRef,
  }: {
    children: ReactNode;
    onLoad?: () => void;
    onClick: (event: {
      features: Array<{ properties: { alertId: string } }>;
    }) => void;
    mapRef: RefObject<{ fitBounds: typeof mockFitBounds } | null>;
  }) => {
    mapRef.current = { fitBounds: mockFitBounds };
    return (
      <div data-testid="map-container">
        {children}
        <button type="button" data-testid="load-map" onClick={onLoad}>
          load
        </button>
        <button
          type="button"
          data-testid="click-geometry"
          onClick={() =>
            onClick({ features: [{ properties: { alertId: 'alert-42' } }] })
          }
        >
          geometry
        </button>
      </div>
    );
  },
}));

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({
    children,
    data,
  }: {
    children: ReactNode;
    data: FeatureCollection;
  }) => (
    <div data-testid="alert-source" data-features={data.features.length}>
      {children}
    </div>
  ),
  Layer: ({ id }: { id: string }) => <div data-testid={id} />,
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

  it('renders neutral point, line, and polygon layers from one alert source', () => {
    render(
      <AlertsMap
        alerts={[
          makeAlert({ type: 'Point', coordinates: [-55, -8] }),
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
        ]}
      />,
    );

    expect(screen.getByTestId('alert-source')).toHaveAttribute(
      'data-features',
      '3',
    );
    expect(screen.getByTestId('alert-points')).toBeInTheDocument();
    expect(screen.getByTestId('alert-lines')).toBeInTheDocument();
    expect(screen.getByTestId('alert-polygons')).toBeInTheDocument();
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

  it('shows the no-location state while invalid alerts remain absent from the map', () => {
    render(
      <AlertsMap
        alerts={[makeAlert({ type: 'Point', coordinates: [999, 999] })]}
      />,
    );

    expect(
      screen.getByText('No alerts with location to show on the map'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('alert-source')).not.toBeInTheDocument();
  });
});
