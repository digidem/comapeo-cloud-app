import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
import type { FeatureCollection, Point } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';

import { getProjectPoints } from '@/lib/data-layer';
import { BoundsEditor } from '@/screens/MapScreen/BoundsEditor';

vi.mock('@/lib/data-layer', () => ({
  getProjectPoints: vi.fn(),
}));

const mockGetProjectPoints = vi.mocked(getProjectPoints);

function pointCollection(
  coordinates: Array<[number, number]>,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: coordinates.map(([lon, lat], index) => ({
      type: 'Feature',
      properties: { index },
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    })),
  };
}

function createMapRef(): RefObject<MapRef> {
  return {
    current: {
      getBounds: () => ({
        getWest: () => -70,
        getSouth: () => -5,
        getEast: () => -60,
        getNorth: () => 2,
      }),
    } as MapRef,
  };
}

describe('BoundsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectPoints.mockResolvedValue(pointCollection([]));
  });

  it('debounces coordinate input changes into a bbox update', async () => {
    const onChange = vi.fn();

    render(
      <BoundsEditor
        bbox={[0, 1, 2, 3]}
        onChange={onChange}
        projectLocalId="project-1"
        mapRef={createMapRef()}
      />,
    );

    fireEvent.change(screen.getByLabelText('West'), {
      target: { value: '-61.5' },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith([-61.5, 1, 2, 3]);
    });
  });

  it('uses the current map view bounds from MapRef', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <BoundsEditor
        bbox={[0, 0, 1, 1]}
        onChange={onChange}
        projectLocalId="project-1"
        mapRef={createMapRef()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Use current view' }));

    expect(onChange).toHaveBeenCalledWith([-70, -5, -60, 2]);
    expect(screen.getByLabelText('West')).toHaveValue(-70);
    expect(screen.getByLabelText('South')).toHaveValue(-5);
    expect(screen.getByLabelText('East')).toHaveValue(-60);
    expect(screen.getByLabelText('North')).toHaveValue(2);
  });

  it('uses the project observation area when coordinates exist', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockGetProjectPoints.mockResolvedValue(
      pointCollection([
        [-70, -5],
        [-60, 2],
      ]),
    );

    render(
      <BoundsEditor
        bbox={[0, 0, 1, 1]}
        onChange={onChange}
        projectLocalId="project-1"
        mapRef={createMapRef()}
      />,
    );

    const projectButton = await screen.findByRole('button', {
      name: 'Use project area',
    });
    await waitFor(() => expect(projectButton).toBeEnabled());
    await user.click(projectButton);

    expect(onChange).toHaveBeenCalledWith([-70, -5, -60, 2]);
  });

  it('disables the project-area button when there are no geocoded observations', async () => {
    render(
      <BoundsEditor
        bbox={[0, 0, 1, 1]}
        onChange={vi.fn()}
        projectLocalId="project-1"
        mapRef={createMapRef()}
      />,
    );

    const projectButton = await screen.findByRole('button', {
      name: 'Use project area',
    });

    await waitFor(() => expect(projectButton).toBeDisabled());
    expect(
      screen.getByText('No observations with coordinates in this project yet'),
    ).toBeInTheDocument();
  });
});
