import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { GeometryPicker } from '@/components/shared/GeometryPicker';

vi.mock('@/components/shared/MapContainer/MapContainer', () => ({
  MapContainer: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: (event: { lngLat: { lng: number; lat: number } }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onClick?.({ lngLat: { lng: 10, lat: 20 } })}
      >
        Map click
      </button>
      {children}
    </div>
  ),
}));

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('GeometryPicker', () => {
  it('commits a point immediately', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GeometryPicker onChange={onChange} />);

    await user.click(screen.getByText('Map click'));

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'Point',
      coordinates: [10, 20],
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
