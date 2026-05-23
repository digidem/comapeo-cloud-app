import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Observation } from '@/lib/data-layer';

// --- Mocks ---

const mockFitBounds = vi.fn();
const mockMapRef = { current: { fitBounds: mockFitBounds } };

vi.mock('@/components/shared/MapContainer', () => ({
  MapContainer: ({
    children,
    onLoad,
    mapRef,
  }: {
    children: React.ReactNode;
    onLoad?: () => void;
    mapRef?: React.RefObject<{ fitBounds: typeof mockFitBounds } | null>;
    initialViewState?: Record<string, unknown>;
    height?: string | number;
    className?: string;
  }) => {
    // Wire up the ref so tests can assert fitBounds
    if (mapRef && typeof mapRef === 'object' && 'current' in mapRef) {
      (
        mapRef as React.MutableRefObject<{
          fitBounds: typeof mockFitBounds;
        } | null>
      ).current = mockMapRef.current;
    }
    return (
      <div data-testid="map-container">
        {children}
        <button data-testid="map-load-trigger" onClick={onLoad}>
          load
        </button>
      </div>
    );
  },
}));

vi.mock('react-map-gl/maplibre', () => ({
  Marker: ({
    longitude,
    latitude,
    children,
    onClick,
  }: {
    longitude: number;
    latitude: number;
    children: React.ReactNode;
    onClick?: (e: { originalEvent: { stopPropagation: () => void } }) => void;
  }) => (
    <div
      data-testid="obs-marker"
      data-lon={longitude}
      data-lat={latitude}
      onClick={
        onClick
          ? () => onClick({ originalEvent: { stopPropagation: vi.fn() } })
          : undefined
      }
    >
      {children}
    </div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// --- Helpers ---

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: `obs-${Math.random().toString(36).slice(2, 8)}`,
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'local-1',
    tags: {},
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

// --- Tests ---

describe('ObservationsMap', () => {
  let ObservationsMap: typeof import('@/components/shared/ObservationsMap/ObservationsMap').ObservationsMap;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get fresh module after mocks
    const mod =
      await import('@/components/shared/ObservationsMap/ObservationsMap');
    ObservationsMap = mod.ObservationsMap;
  });

  it('renders one marker per observation with valid coords', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: -8.35, lon: -55.45 }),
      makeObservation({ localId: 'obs-2', lat: -9.0, lon: -56.0 }),
    ];

    render(<ObservationsMap observations={observations} />);

    const markers = screen.getAllByTestId('obs-marker');
    expect(markers).toHaveLength(2);
  });

  it('excludes observations missing lat/lon', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: -8.35, lon: -55.45 }),
      makeObservation({ localId: 'obs-2', lat: -9.0, lon: -56.0 }),
      makeObservation({ localId: 'obs-3' }), // no lat/lon
    ];

    render(<ObservationsMap observations={observations} />);

    const markers = screen.getAllByTestId('obs-marker');
    expect(markers).toHaveLength(2);
  });

  it('excludes observations with invalid coords (NaN)', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: -8.35, lon: -55.45 }),
      makeObservation({ localId: 'obs-2', lat: NaN, lon: NaN }),
      makeObservation({ localId: 'obs-3', lat: 999, lon: -55.45 }),
    ];

    render(<ObservationsMap observations={observations} />);

    const markers = screen.getAllByTestId('obs-marker');
    expect(markers).toHaveLength(1);
  });

  it('marker click navigates to observation detail', async () => {
    const observations = [
      makeObservation({ localId: 'obs-42', lat: -8.35, lon: -55.45 }),
    ];

    render(<ObservationsMap observations={observations} />);

    const marker = screen.getByTestId('obs-marker');
    marker.click();

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/data/observations/$observationId',
      params: { observationId: 'obs-42' },
    });
  });

  it('uses onMarkerClick override when provided', async () => {
    const onMarkerClick = vi.fn();
    const observations = [
      makeObservation({ localId: 'obs-99', lat: -8.35, lon: -55.45 }),
    ];

    render(
      <ObservationsMap
        observations={observations}
        onMarkerClick={onMarkerClick}
      />,
    );

    const marker = screen.getByTestId('obs-marker');
    marker.click();

    expect(onMarkerClick).toHaveBeenCalledWith('obs-99');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders empty message when no geo observations', () => {
    const observations = [
      makeObservation({ localId: 'obs-1' }), // no lat/lon
    ];

    render(<ObservationsMap observations={observations} />);

    expect(
      screen.getByText('No observations with location to show on the map'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('obs-marker')).not.toBeInTheDocument();
  });

  it('renders map with no markers and no crash for empty array', () => {
    render(<ObservationsMap observations={[]} />);

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.queryByTestId('obs-marker')).not.toBeInTheDocument();
  });

  it('calls fitBounds on map load', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: -8.35, lon: -55.45 }),
      makeObservation({ localId: 'obs-2', lat: -9.0, lon: -56.0 }),
    ];

    render(<ObservationsMap observations={observations} />);

    // Trigger the onLoad callback
    screen.getByTestId('map-load-trigger').click();

    expect(mockFitBounds).toHaveBeenCalled();
    const callArgs = mockFitBounds.mock.calls[0]![0];
    // Bounds should be [[minLng, minLat], [maxLng, maxLat]]
    // obs-1: lat=-8.35, lon=-55.45; obs-2: lat=-9.0, lon=-56.0
    expect(callArgs[0][0]).toBe(-56.0); // minLng
    expect(callArgs[0][1]).toBe(-9.0); // minLat
    expect(callArgs[1][0]).toBe(-55.45); // maxLng
    expect(callArgs[1][1]).toBe(-8.35); // maxLat
  });

  it('does not crash with a single geo observation', () => {
    const observations = [
      makeObservation({ localId: 'obs-1', lat: -8.35, lon: -55.45 }),
    ];

    render(<ObservationsMap observations={observations} />);

    screen.getByTestId('map-load-trigger').click();

    expect(mockFitBounds).toHaveBeenCalled();
  });

  it('does not call fitBounds when there are no geo observations', () => {
    const observations = [
      makeObservation({ localId: 'obs-1' }), // no coords
    ];

    render(<ObservationsMap observations={observations} />);

    screen.getByTestId('map-load-trigger').click();

    expect(mockFitBounds).not.toHaveBeenCalled();
  });
});
