import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeometryPicker } from '@/components/shared/GeometryPicker';

const mockFitBounds = vi.fn();
const mockGetProjectPoints = vi.fn();

vi.mock('@/components/shared/MapContainer/MapContainer', () => ({
  MapContainer: ({
    children,
    mapRef,
    onClick,
    onLoad,
  }: {
    children: React.ReactNode;
    mapRef?: React.MutableRefObject<unknown>;
    onClick?: (event: { lngLat: { lng: number; lat: number } }) => void;
    onLoad?: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onClick?.({ lngLat: { lng: 10, lat: 20 } })}
      >
        Map click
      </button>
      <button
        type="button"
        onClick={() => {
          if (mapRef) mapRef.current = { fitBounds: mockFitBounds };
          onLoad?.();
        }}
      >
        Map load
      </button>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/data-layer', () => ({
  getProjectPoints: (...args: unknown[]) => mockGetProjectPoints(...args),
}));

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('GeometryPicker', () => {
  beforeEach(() => {
    mockFitBounds.mockReset();
    mockGetProjectPoints.mockReset();
  });

  it('fits the map to the monitored project area', async () => {
    mockGetProjectPoints.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-50, -4] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-48, -2] },
        },
      ],
    });
    const user = userEvent.setup();
    render(<GeometryPicker projectLocalId="proj-1" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(mockGetProjectPoints).toHaveBeenCalledWith('proj-1'),
    );
    await user.click(screen.getByText('Map load'));

    expect(mockFitBounds).toHaveBeenCalledWith(
      [
        [-50, -4],
        [-48, -2],
      ],
      {
        padding: { top: 64, bottom: 32, left: 32, right: 32 },
        maxZoom: 14,
        duration: 0,
      },
    );
  });

  it('uses the shared project bbox behavior for a single focused point', async () => {
    mockGetProjectPoints.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-50, -4] },
        },
      ],
    });
    const user = userEvent.setup();
    render(<GeometryPicker projectLocalId="proj-1" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(mockGetProjectPoints).toHaveBeenCalledWith('proj-1'),
    );
    await user.click(screen.getByText('Map load'));

    expect(mockFitBounds).toHaveBeenCalledWith(
      [
        [-50, -4],
        [-49.99, -3.99],
      ],
      {
        padding: { top: 64, bottom: 32, left: 32, right: 32 },
        maxZoom: 14,
        duration: 0,
      },
    );
  });

  it('commits a point immediately and mirrors map coordinates into the inputs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.click(screen.getByText('Map click'));

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'Point',
      coordinates: [10, 20],
    });
    expect(screen.getByLabelText('Longitude')).toHaveValue(10);
    expect(screen.getByLabelText('Latitude')).toHaveValue(20);
  });

  it('renders alert vertices as red markers', async () => {
    const user = userEvent.setup();
    render(<GeometryPicker onChange={vi.fn()} />);

    await user.click(screen.getByText('Map click'));

    expect(screen.getByRole('img', { name: 'Vertex 1' })).toHaveClass(
      'bg-error',
    );
    expect(screen.getByRole('img', { name: 'Vertex 1' })).not.toHaveClass(
      'bg-primary',
    );
  });

  it('allows keyboard users to add a point with coordinates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.type(screen.getByLabelText('Longitude'), '-51.25');
    await user.type(screen.getByLabelText('Latitude'), '-3.75');
    await user.click(screen.getByRole('button', { name: 'Add point' }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'Point',
      coordinates: [-51.25, -3.75],
    });
    expect(screen.getByRole('img', { name: 'Vertex 1' })).toBeInTheDocument();
  });

  it('invalidates committed geometry when manual coordinates are invalid', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.click(screen.getByText('Map click'));
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'Point',
      coordinates: [10, 20],
    });

    await user.type(screen.getByLabelText('Longitude'), '200');
    await user.type(screen.getByLabelText('Latitude'), '10');
    await user.click(screen.getByRole('button', { name: 'Add point' }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps an edited line as a draft after undo until Finish is pressed again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /^Line$/ }));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'LineString',
      coordinates: [
        [10, 20],
        [10, 20],
        [10, 20],
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Undo last point' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'LineString',
      coordinates: [
        [10, 20],
        [10, 20],
      ],
    });
  });

  it('invalidates a finished line when another vertex is added', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /^Line$/ }));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'LineString',
      coordinates: [
        [10, 20],
        [10, 20],
      ],
    });

    await user.click(screen.getByText('Map click'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('reports a specific validation error for an unfinished polygon', async () => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();
    render(
      <GeometryPicker
        onChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Polygon$/ }));
    await user.click(screen.getByText('Map click'));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(onValidationChange).toHaveBeenLastCalledWith(
      'A polygon needs at least 3 points.',
    );
  });
});
