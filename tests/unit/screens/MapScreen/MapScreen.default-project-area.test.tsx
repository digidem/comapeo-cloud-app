// Test for issue #153: MapScreen should default to project area when observations have geolocation
import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { getProjectPoints } from '@/lib/data-layer';
import { getDb, resetDb } from '@/lib/db';
import { MapScreen } from '@/screens/MapScreen/MapScreen';
import { useProjectStore } from '@/stores/project-store';

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

const mapProps: Array<Record<string, unknown>> = [];
const attributionControlProps: Array<Record<string, unknown>> = [];
const fitBoundsMock = vi.fn();
const unprojectMock = vi.fn((point: [number, number]) => ({
  lng: point[0],
  lat: point[1],
}));

interface MockMapHandle {
  fitBounds: typeof fitBoundsMock;
  getMap: () => {
    getCanvas: () => { clientWidth: number; clientHeight: number };
    getBounds: () => {
      getWest: () => -70;
      getSouth: () => -10;
      getEast: () => -50;
      getNorth: () => 5;
    };
    unproject: typeof unprojectMock;
    dragPan: { enable: () => void; disable: () => void };
    scrollZoom: { enable: () => void; disable: () => void };
    on: () => void;
    off: () => void;
  };
}

vi.mock('react-map-gl/maplibre', () => ({
  default: React.forwardRef<MockMapHandle, Record<string, unknown>>(
    function MockMap(props, ref) {
      mapProps.push(props);
      React.useEffect(() => {
        const onLoad = props.onLoad as (() => void) | undefined;
        onLoad?.();
      }, [props.onLoad]);
      React.useImperativeHandle(ref, () => ({
        fitBounds: fitBoundsMock,
        getMap: () => ({
          getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
          getBounds: () => ({
            getWest: () => -70,
            getSouth: () => -10,
            getEast: () => -50,
            getNorth: () => 5,
          }),
          unproject: unprojectMock,
          dragPan: { enable: vi.fn(), disable: vi.fn() },
          scrollZoom: { enable: vi.fn(), disable: vi.fn() },
          on: vi.fn(),
          off: vi.fn(),
        }),
      }));
      return (
        <div
          data-testid="mock-authoring-map"
          data-map-style={
            typeof props.mapStyle === 'string'
              ? props.mapStyle
              : 'StyleSpecification'
          }
        >
          {props.children as React.ReactNode}
        </div>
      );
    },
  ),
  Source: (props: Record<string, unknown>) => (
    <div data-testid={`mock-source-${props.id}`}>
      {props.children as React.ReactNode}
    </div>
  ),
  Layer: (props: Record<string, unknown>) => (
    <div data-testid={`mock-layer-${props.id}`} />
  ),
  AttributionControl: (props: Record<string, unknown>) => {
    attributionControlProps.push(props);
    return null;
  },
}));

// Mock getProjectPoints to return features with geolocation
vi.mock('@/lib/data-layer', async () => {
  const actual = await vi.importActual('@/lib/data-layer');
  return {
    ...actual,
    getProjectPoints: vi.fn(),
  };
});

describe('MapScreen - default project area (issue #153)', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    mapProps.length = 0;
    attributionControlProps.length = 0;
    fitBoundsMock.mockReset();
    unprojectMock.mockReset();
    unprojectMock.mockImplementation((point: [number, number]) => ({
      lng: point[0],
      lat: point[1],
    }));
    useProjectStore.setState({ selectedProjectId: 'project-1' });
    await getDb().projects.add({
      localId: 'project-1',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Forest Watch',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });
    vi.mocked(getProjectPoints).mockReset();
  });

  it('defaults to project area bbox when project has geolocated observations', async () => {
    // Mock getProjectPoints to return observations with lat/lon
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { docId: 'obs-1', createdAt: '2026-01-01T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-70, -10] },
        },
        {
          type: 'Feature',
          properties: { docId: 'obs-2', createdAt: '2026-01-02T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-50, 5] },
        },
      ],
    });

    render(<MapScreen />);

    // Wait for the map to render
    await screen.findByTestId('mock-authoring-map');

    // The MapScreen should use the project area bbox (computed from observations)
    // instead of DEFAULT_BBOX. The bbox is set via the on-mount logic.
    // We can verify by checking that hasConfigChanges is false at default
    // (since the bbox should now be the project area, not DEFAULT_BBOX).
    // Actually, the test needs to verify the bbox state was updated.
    // Let me check the BoundsEditor inputs for the computed bbox.

    // Open settings to see BoundsEditor
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Map settings' }),
    );

    // The BoundsEditor should show the computed project bbox
    // bbox from observations: west=-70, south=-10, east=-50, north=5
    await waitFor(() => {
      const westInput = screen.getByLabelText('West');
      expect(westInput).toHaveValue(-70);
      const southInput = screen.getByLabelText('South');
      expect(southInput).toHaveValue(-10);
      const eastInput = screen.getByLabelText('East');
      expect(eastInput).toHaveValue(-50);
      const northInput = screen.getByLabelText('North');
      expect(northInput).toHaveValue(5);
    });
  });

  it('fits the map to the project bbox with padding after project points load', async () => {
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { docId: 'obs-1', createdAt: '2026-01-01T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-70, -10] },
        },
        {
          type: 'Feature',
          properties: { docId: 'obs-2', createdAt: '2026-01-02T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-50, 5] },
        },
      ],
    });

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');

    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenLastCalledWith(
        [
          [-70, -10],
          [-50, 5],
        ],
        {
          padding: { top: 64, bottom: 32, left: 32, right: 32 },
          duration: 0,
          maxZoom: 14,
        },
      );
    });
  });

  it('does not overwrite a manual bbox edit when project points resolve late', async () => {
    let resolvePoints!: (
      value: Awaited<ReturnType<typeof getProjectPoints>>,
    ) => void;
    const pendingPoints = new Promise<
      Awaited<ReturnType<typeof getProjectPoints>>
    >((resolve) => {
      resolvePoints = resolve;
    });
    vi.mocked(getProjectPoints).mockReturnValue(pendingPoints);

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');

    const user = userEvent.setup();
    const westInput = screen.getByLabelText('West');
    await user.clear(westInput);
    await user.type(westInput, '-72');

    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', {
        name: 'Save Map',
        hidden: true,
      });
      expect(saveButtons[saveButtons.length - 1]).toBeEnabled();
    });

    resolvePoints({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { docId: 'obs-1', createdAt: '2026-01-01T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-40, -5] },
        },
        {
          type: 'Feature',
          properties: { docId: 'obs-2', createdAt: '2026-01-02T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-30, 2] },
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByLabelText('West')).toHaveValue(-72);
    });
    // The manual edit should not trigger a fitBounds call with the project bbox
    // Since we made an edit before the points resolved, hasUserModifiedBboxRef is true
    // So no fitBounds should be called at all (autoFitBbox starts as null, so no initial fit either)
    expect(fitBoundsMock).toHaveBeenCalledTimes(0);
  });

  it('treats the computed project bbox as the unchanged config baseline', async () => {
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { docId: 'obs-1', createdAt: '2026-01-01T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-70, -10] },
        },
        {
          type: 'Feature',
          properties: { docId: 'obs-2', createdAt: '2026-01-02T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [-50, 5] },
        },
      ],
    });

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');
    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenLastCalledWith(
        [
          [-70, -10],
          [-50, 5],
        ],
        {
          padding: { top: 64, bottom: 32, left: 32, right: 32 },
          duration: 0,
          maxZoom: 14,
        },
      );
    });

    const saveButtons = screen.getAllByRole('button', {
      name: 'Save Map',
      hidden: true,
    });
    expect(saveButtons[saveButtons.length - 1]).toBeDisabled();
  });

  it('pads a single-point project to the minimum bbox span before fitting', async () => {
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { docId: 'obs-1', createdAt: '2026-01-01T00:00:00.000Z' },
          geometry: { type: 'Point', coordinates: [10, 20] },
        },
      ],
    });

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');

    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenLastCalledWith(
        [
          [10, 20],
          [10.01, 20.01],
        ],
        {
          padding: { top: 64, bottom: 32, left: 32, right: 32 },
          duration: 0,
          maxZoom: 14,
        },
      );
    });
  });

  it('falls back to DEFAULT_BBOX when loading project points throws', async () => {
    vi.mocked(getProjectPoints).mockRejectedValue(new Error('db read failed'));

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');

    // Wait for the error to be caught and fallback to apply
    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenLastCalledWith(
        [
          [-75, -12],
          [-45, 8],
        ],
        {
          padding: { top: 64, bottom: 32, left: 32, right: 32 },
          duration: 0,
          maxZoom: 14,
        },
      );
    });
  });

  it('falls back to DEFAULT_BBOX when project has no geolocated observations', async () => {
    // Mock getProjectPoints to return empty FeatureCollection (no points with valid coords)
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [],
    });

    render(<MapScreen />);

    await screen.findByTestId('mock-authoring-map');

    // Wait for the fallback to apply (should be 1 call with DEFAULT_BBOX)
    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(fitBoundsMock).toHaveBeenLastCalledWith(
        [
          [-75, -12],
          [-45, 8],
        ],
        {
          padding: { top: 64, bottom: 32, left: 32, right: 32 },
          duration: 0,
          maxZoom: 14,
        },
      );
    });

    // Also verify the BoundsEditor shows the fallback values
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Map settings' }),
    );

    await waitFor(() => {
      const westInput = screen.getByLabelText('West');
      expect(westInput).toHaveValue(-75);
      const southInput = screen.getByLabelText('South');
      expect(southInput).toHaveValue(-12);
      const eastInput = screen.getByLabelText('East');
      expect(eastInput).toHaveValue(-45);
      const northInput = screen.getByLabelText('North');
      expect(northInput).toHaveValue(8);
    });
  });

  it('hasConfigChanges is false at default config when using project area fallback', async () => {
    // No geolocated observations -> uses DEFAULT_BBOX
    vi.mocked(getProjectPoints).mockResolvedValue({
      type: 'FeatureCollection',
      features: [],
    });

    render(<MapScreen />);
    await screen.findByTestId('mock-authoring-map');

    // The settings-sheet Save Map should be disabled at defaults
    // (hasConfigChanges should be false)
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Map settings', hidden: true }),
    );

    const allSaves = screen.getAllByRole('button', {
      name: 'Save Map',
      hidden: true,
    });
    const settingsSheetSave = allSaves[allSaves.length - 1];
    expect(settingsSheetSave).toBeDisabled();
  });
});
