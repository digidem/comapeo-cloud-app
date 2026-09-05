import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { focusManager } from '@tanstack/react-query';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import { useMapStore } from '@/stores/map-store';
import { useProjectStore } from '@/stores/project-store';

// Mock maplibre-gl CSS import
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

// Track props passed to Map for passthrough assertions
const mapProps: Array<Record<string, unknown>> = [];

// --- SMP mocks ---
const mockResolveSmpStyle = vi.fn().mockResolvedValue({
  version: 8,
  sources: {},
  layers: [],
});
const mockGetSmpReader = vi.fn().mockResolvedValue({});
const mockCloseSmpReader = vi.fn().mockResolvedValue(undefined);
const mockRegisterSmpProtocol = vi.fn();
const mockSanitizeImportedSmpStyle = vi.fn((style) => style);

vi.mock('@/lib/map/smp-serve', () => ({
  resolveSmpStyle: (...args: unknown[]) => mockResolveSmpStyle(...args),
  getSavedMapSmpReader: (...args: unknown[]) => mockGetSmpReader(...args),
  registerSmpProtocol: (...args: unknown[]) => mockRegisterSmpProtocol(...args),
  sanitizeImportedSmpStyle: (style: unknown) =>
    mockSanitizeImportedSmpStyle(style),
  closeSmpReader: (...args: unknown[]) => mockCloseSmpReader(...args),
}));

const mockDbGet = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    maps: { get: (...args: unknown[]) => mockDbGet(...args) },
  }),
}));

// Mock react-map-gl/maplibre
vi.mock('react-map-gl/maplibre', () => {
  return {
    default: (props: Record<string, unknown>) => {
      mapProps.push(props);
      return (
        <div
          data-testid="mock-map"
          data-map-style={
            typeof props.mapStyle === 'string'
              ? props.mapStyle
              : 'StyleSpecification'
          }
          data-cursor={props.cursor as string}
        >
          {props.children as React.ReactNode}
        </div>
      );
    },
    Source: (props: Record<string, unknown>) => (
      <div
        data-testid={`mock-source-${props.id}`}
        data-source-id={props.id as string}
      >
        {props.children as React.ReactNode}
      </div>
    ),
    Layer: (props: Record<string, unknown>) => (
      <div
        data-testid={`mock-layer-${props.id}`}
        data-layer-id={props.id as string}
      />
    ),
    AttributionControl: (props: Record<string, unknown>) => {
      const position = (props.position as string) || 'bottom-right';
      const compact = props.compact ? ' maplibregl-compact' : '';
      return (
        <div className={`maplibregl-ctrl maplibregl-ctrl-${position}`}>
          <div className={`maplibregl-ctrl-attrib${compact}`}>
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
            contributors | <a href="https://maplibre.org">MapLibre</a>
          </div>
        </div>
      );
    },
  };
});

beforeEach(() => {
  mapProps.length = 0;
  localStorage.clear();
  focusManager.setFocused(undefined);
  mockResolveSmpStyle.mockReset().mockResolvedValue({
    version: 8,
    sources: {},
    layers: [],
  });
  mockGetSmpReader.mockReset().mockResolvedValue({});
  mockCloseSmpReader.mockReset().mockResolvedValue(undefined);
  mockRegisterSmpProtocol.mockReset();
  mockSanitizeImportedSmpStyle.mockReset().mockImplementation((style) => style);
  mockDbGet.mockReset().mockResolvedValue(undefined);
  useMapStore.setState({ basemapId: 'carto-positron', activeMapId: null });
  useProjectStore.setState({ selectedProjectId: null, selectedServerId: null });
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('MapContainer', () => {
  it('renders the map with default basemap style', () => {
    render(<MapContainer />);
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
  });

  it('passes the correct mapStyle for the store basemap', () => {
    useMapStore.setState({ basemapId: 'carto-positron' });
    render(<MapContainer />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toContain('cartocdn.com');
  });

  it('passes a StyleSpecification for raster basemaps', () => {
    useMapStore.setState({ basemapId: 'osm-standard' });
    render(<MapContainer />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toBe('StyleSpecification');
  });

  it('shows the basemap switcher by default', () => {
    render(<MapContainer />);
    expect(screen.getByTestId('basemap-switcher')).toBeInTheDocument();
  });

  it('uses a custom basemap switcher position class when provided', () => {
    render(
      <MapContainer basemapSwitcherPositionClassName="top-[4.25rem] right-3" />,
    );
    expect(screen.getByTestId('basemap-switcher').parentElement).toHaveClass(
      'top-[4.25rem]',
      'right-3',
    );
  });

  it('hides the basemap switcher when showBasemapSwitcher is false', () => {
    render(<MapContainer showBasemapSwitcher={false} />);
    expect(screen.queryByTestId('basemap-switcher')).not.toBeInTheDocument();
  });

  it('renders children inside the map', () => {
    render(
      <MapContainer>
        <div data-testid="child-content">Map child</div>
      </MapContainer>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('uses controlled basemapId when provided', () => {
    render(<MapContainer basemapId="esri-world-imagery" />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toBe('StyleSpecification');
  });

  it('seeds store with defaultBasemapId on mount', async () => {
    render(<MapContainer defaultBasemapId="osm-standard" />);
    // After mount effect runs, the store should be seeded
    await waitFor(() => {
      expect(useMapStore.getState().basemapId).toBe('osm-standard');
    });
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toBe('StyleSpecification');
  });

  it('defaultBasemapId does not override controlled basemapId', () => {
    render(
      <MapContainer
        basemapId="carto-positron"
        defaultBasemapId="osm-standard"
      />,
    );
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toContain('cartocdn.com');
    // Store should NOT be seeded when controlled
    expect(useMapStore.getState().basemapId).toBe('carto-positron');
  });

  it('switcher changes persist after defaultBasemapId seeding', async () => {
    const user = userEvent.setup();
    render(<MapContainer defaultBasemapId="osm-standard" />);

    // Wait for seeding
    await waitFor(() => {
      expect(useMapStore.getState().basemapId).toBe('osm-standard');
    });

    // Switch basemap via the switcher
    await user.click(screen.getByRole('button', { name: /basemap/i }));
    await user.click(screen.getByText('CartoDB Positron'));

    // Store should now be updated and sticky
    expect(useMapStore.getState().basemapId).toBe('carto-positron');
  });

  it('calls onBasemapChange when switcher changes', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MapContainer
        basemapId="carto-positron"
        onBasemapChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /basemap/i }));
    await user.click(
      screen.getByRole('menuitemradio', { name: 'OpenStreetMap' }),
    );

    expect(handleChange).toHaveBeenCalledWith('osm-standard');
  });

  it('uses custom basemaps catalog when provided', () => {
    const customCatalog = [
      {
        id: 'custom',
        name: 'Custom Map',
        category: 'street' as const,
        type: 'style' as const,
        url: 'https://example.com/style.json',
      },
    ];
    render(<MapContainer basemapId="custom" basemaps={customCatalog} />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toBe('https://example.com/style.json');
  });

  it('custom catalog without default basemap falls back to first entry', () => {
    const customCatalog = [
      {
        id: 'custom-a',
        name: 'Custom A',
        category: 'satellite' as const,
        type: 'style' as const,
        url: 'https://example.com/a/style.json',
      },
    ];
    render(<MapContainer basemaps={customCatalog} />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toBe('https://example.com/a/style.json');
  });

  it('applies custom className to container', () => {
    render(<MapContainer className="custom-container" />);
    const container = screen.getByTestId('map-container');
    expect(container.classList.contains('custom-container')).toBe(true);
    expect(container).toHaveClass('isolate');
  });

  it('does not have trailing space in className when no custom class', () => {
    render(<MapContainer />);
    const container = screen.getByTestId('map-container');
    expect(container.className).not.toMatch(/\s$/);
  });

  it('applies custom height style', () => {
    render(<MapContainer height={400} />);
    const container = screen.getByTestId('map-container');
    expect(container.style.height).toBe('400px');
  });

  it('uses default height of 100% when not specified', () => {
    render(<MapContainer />);
    const container = screen.getByTestId('map-container');
    expect(container.style.height).toBe('100%');
  });

  it('shows the view-only badge when interactive is false', () => {
    render(<MapContainer interactive={false} />);
    expect(screen.getByTestId('map-view-only-badge')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('does not show the view-only badge when interactive (default)', () => {
    render(<MapContainer />);
    expect(screen.queryByTestId('map-view-only-badge')).not.toBeInTheDocument();
  });

  it('hides the view-only badge when showViewOnlyBadge is false', () => {
    render(<MapContainer interactive={false} showViewOnlyBadge={false} />);
    expect(screen.queryByTestId('map-view-only-badge')).not.toBeInTheDocument();
  });

  it('forwards passthrough props to the underlying Map', () => {
    render(<MapContainer cursor="crosshair" />);
    // The last Map render should have received the cursor prop
    const lastProps = mapProps[mapProps.length - 1];
    expect(lastProps).toBeTruthy();
    expect(lastProps!.cursor).toBe('crosshair');
  });

  it('renders the attribution control in top-left', () => {
    render(<MapContainer />);
    expect(screen.getByText(/OpenStreetMap/)).toBeTruthy();
    expect(screen.getByText(/MapLibre/)).toBeTruthy();
  });

  it('uses a local style while active-map hydration is pending', () => {
    useProjectStore.setState({ selectedProjectId: 'proj-1' });
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
    render(<MapContainer />);
    expect(mapProps.at(-1)?.mapStyle).toEqual({
      version: 8,
      sources: {},
      layers: [],
    });
  });

  it('hides a resolved SMP while a different project is hydrating', async () => {
    const oldStyle = {
      version: 8 as const,
      sources: {},
      layers: [{ id: 'old-project', type: 'background' as const }],
    };
    mockResolveSmpStyle.mockResolvedValueOnce(oldStyle);
    useProjectStore.setState({ selectedProjectId: 'proj-1' });
    useMapStore.setState({
      activeProjectLocalId: 'proj-1',
      activeMapId: 'old-map',
    });
    mockDbGet.mockResolvedValue({
      id: 'old-map',
      projectLocalId: 'proj-1',
      name: 'Old Project Map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      status: 'ready',
      smpBlob: new Blob(),
    });

    render(<MapContainer />);
    await waitFor(() => expect(mapProps.at(-1)?.mapStyle).toEqual(oldStyle));

    act(() => {
      useProjectStore.setState({ selectedProjectId: 'proj-2' });
    });
    await waitFor(() =>
      expect(mapProps.at(-1)?.mapStyle).toEqual({
        version: 8,
        sources: {},
        layers: [],
      }),
    );
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  it('never renders a resolved SMP after its active map is cleared', async () => {
    const oldStyle = {
      version: 8 as const,
      sources: {},
      layers: [{ id: 'cleared-map', type: 'background' as const }],
    };
    mockResolveSmpStyle.mockResolvedValueOnce(oldStyle);
    useProjectStore.setState({ selectedProjectId: 'proj-1' });
    useMapStore.setState({
      activeProjectLocalId: 'proj-1',
      activeMapId: 'old-map',
    });
    mockDbGet.mockResolvedValue({
      id: 'old-map',
      projectLocalId: 'proj-1',
      name: 'Old Project Map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      status: 'ready',
      smpBlob: new Blob(),
    });

    render(<MapContainer />);
    await waitFor(() => expect(mapProps.at(-1)?.mapStyle).toEqual(oldStyle));
    const renderStart = mapProps.length;

    act(() => {
      useMapStore.setState({ activeMapId: null });
    });

    expect(
      mapProps.slice(renderStart).map((props) => props.mapStyle),
    ).not.toContainEqual(oldStyle);
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // SMP (Saved Map Package) offline-map tests
  // -------------------------------------------------------------------

  it('renders active offline map badge when SMP is active', async () => {
    useMapStore.setState({ activeMapId: 'map-1' });
    mockDbGet.mockResolvedValue({
      id: 'map-1',
      projectLocalId: 'proj-1',
      name: 'My Offline Map',
      status: 'ready',
      smpBlob: new Blob(),
    });
    render(<MapContainer />);
    await waitFor(() => {
      expect(screen.getByTestId('map-active-map-badge')).toBeInTheDocument();
    });
    expect(screen.getByText(/Active offline map/)).toBeInTheDocument();
  });

  it('sanitizes an imported SMP style before rendering it as the active map', async () => {
    mockSanitizeImportedSmpStyle.mockClear();
    useMapStore.setState({ activeMapId: 'imported-map' });
    mockDbGet.mockResolvedValue({
      id: 'imported-map',
      projectLocalId: 'proj-1',
      name: 'Imported Map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      status: 'ready',
      smpBlob: new Blob(),
    });

    render(<MapContainer />);

    await waitFor(() => {
      expect(mockSanitizeImportedSmpStyle).toHaveBeenCalledWith(
        expect.objectContaining({ version: 8 }),
      );
    });
  });

  it('shows an error when an active imported SMP cannot be rendered safely', async () => {
    mockSanitizeImportedSmpStyle.mockReturnValueOnce(null);
    useMapStore.setState({ activeMapId: 'unsafe-imported-map' });
    mockDbGet.mockResolvedValue({
      id: 'unsafe-imported-map',
      projectLocalId: 'proj-1',
      name: 'Unsafe Imported Map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      status: 'ready',
      smpBlob: new Blob(),
    });

    render(<MapContainer />);

    expect(await screen.findByTestId('map-active-map-error')).toHaveTextContent(
      'Offline map unavailable: Unsafe Imported Map',
    );
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('map-online-active-badge'),
    ).not.toBeInTheDocument();
  });

  it('does not reload an errored SMP package just because window focus changes', async () => {
    focusManager.setFocused(false);
    const mapRecord = {
      id: 'retry-map',
      projectLocalId: 'proj-1',
      name: 'Retry Map',
      type: 'style' as const,
      origin: 'imported' as const,
      styleUrl: '',
      status: 'ready' as const,
      updatedAt: '2026-08-10T00:00:00.000Z',
      smpSize: 123,
    };
    mockDbGet.mockResolvedValue(mapRecord);
    mockSanitizeImportedSmpStyle.mockReturnValueOnce(null);
    mockGetSmpReader.mockResolvedValueOnce({});
    useMapStore.setState({ activeMapId: mapRecord.id });

    try {
      render(<MapContainer />);
      expect(
        await screen.findByTestId('map-active-map-error'),
      ).toBeInTheDocument();
      expect(mockGetSmpReader).toHaveBeenCalledTimes(1);

      await act(async () => {
        focusManager.setFocused(true);
        await Promise.resolve();
      });

      expect(mockDbGet).toHaveBeenCalledTimes(1);
      expect(mockGetSmpReader).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('map-active-map-error')).toBeInTheDocument();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it('keeps the online-active indicator when an authored map SMP fails', async () => {
    mockResolveSmpStyle.mockResolvedValueOnce(null);
    useMapStore.setState({ activeMapId: 'authored-online-fallback' });
    mockDbGet.mockResolvedValue({
      id: 'authored-online-fallback',
      projectLocalId: 'proj-1',
      name: 'Authored Map',
      type: 'style',
      origin: 'authored',
      styleUrl: 'https://example.com/style.json',
      status: 'ready',
      smpBlob: new Blob(),
    });

    render(<MapContainer />);

    expect(await screen.findByTestId('map-active-map-error')).toHaveTextContent(
      'Offline map unavailable: Authored Map',
    );
    expect(screen.getByTestId('map-online-active-badge')).toHaveTextContent(
      'Active map (online): Authored Map',
    );
  });

  it('closes a reader that resolves after the active-map effect is cancelled', async () => {
    mockCloseSmpReader.mockClear();
    let resolveReader!: (reader: object) => void;
    mockGetSmpReader.mockImplementationOnce(
      () => new Promise<object>((resolve) => (resolveReader = resolve)),
    );
    useMapStore.setState({ activeMapId: 'late-map' });
    mockDbGet.mockResolvedValue({
      id: 'late-map',
      projectLocalId: 'proj-1',
      name: 'Late Map',
      type: 'style',
      origin: 'imported',
      styleUrl: '',
      status: 'ready',
      smpBlob: new Blob(),
    });

    const { unmount } = render(<MapContainer />);
    await waitFor(() => expect(mockGetSmpReader).toHaveBeenCalled());
    const readerId = mockGetSmpReader.mock.calls[0]![0] as string;
    expect(readerId).toMatch(/^active:late-map:/);
    unmount();
    resolveReader({});

    await waitFor(() => expect(mockCloseSmpReader).toHaveBeenCalledTimes(1));
    expect(mockCloseSmpReader).toHaveBeenCalledWith(readerId);
  });

  it('keeps a resolved SMP reader stable across window focus changes', async () => {
    mockGetSmpReader.mockResolvedValue({});
    mockCloseSmpReader.mockClear();
    focusManager.setFocused(false);

    try {
      const mapRecord = {
        id: 'refetched-map',
        projectLocalId: 'proj-1',
        name: 'Refetched Map',
        type: 'style' as const,
        origin: 'imported' as const,
        styleUrl: '',
        status: 'ready' as const,
        updatedAt: '2026-08-10T00:00:00.000Z',
        smpSize: 456,
      };
      mockDbGet.mockResolvedValue(mapRecord);
      useMapStore.setState({ activeMapId: mapRecord.id });

      render(<MapContainer />);

      await waitFor(() => expect(mockGetSmpReader).toHaveBeenCalledTimes(1));
      const readerId = mockGetSmpReader.mock.calls[0]![0] as string;
      expect(readerId).toMatch(/^active:refetched-map:/);

      await act(async () => {
        focusManager.setFocused(true);
        await Promise.resolve();
      });

      expect(mockDbGet).toHaveBeenCalledTimes(1);
      expect(mockGetSmpReader).toHaveBeenCalledTimes(1);
      expect(mockCloseSmpReader).not.toHaveBeenCalledWith(readerId);
      expect(screen.getByTestId('map-active-map-badge')).toBeInTheDocument();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it('does not render active offline map badge when no active map', () => {
    useMapStore.setState({ activeMapId: null });
    render(<MapContainer />);
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  it('falls back to basemap when a ready saved package cannot be opened', async () => {
    useMapStore.setState({ activeMapId: 'map-2' });
    mockDbGet.mockResolvedValue({
      id: 'map-2',
      projectLocalId: 'proj-1',
      name: 'Incomplete Map',
      status: 'ready',
    });
    mockGetSmpReader.mockRejectedValueOnce(new Error('SMP package is missing'));
    render(<MapContainer />);
    await waitFor(() =>
      expect(screen.getByTestId('mock-map').dataset.mapStyle).toContain(
        'cartocdn.com',
      ),
    );
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  it('falls back to basemap when activeSavedMap has error status', async () => {
    useMapStore.setState({ activeMapId: 'map-3' });
    mockDbGet.mockResolvedValue({
      id: 'map-3',
      projectLocalId: 'proj-1',
      name: 'Failed Map',
      status: 'error',
      smpBlob: new Blob(),
    });
    render(<MapContainer />);
    await waitFor(() =>
      expect(screen.getByTestId('mock-map').dataset.mapStyle).toContain(
        'cartocdn.com',
      ),
    );
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  it('shows basemap switcher tooltip when SMP is active', async () => {
    useMapStore.setState({ activeMapId: 'map-4' });
    mockDbGet.mockResolvedValue({
      id: 'map-4',
      projectLocalId: 'proj-1',
      name: 'Offline Map',
      status: 'ready',
      smpBlob: new Blob(),
    });
    render(<MapContainer />);
    await waitFor(() => {
      const trigger = screen.getByTestId('basemap-switcher-trigger');
      expect(trigger).toHaveAttribute('title');
      expect(trigger.getAttribute('title')).toBeTruthy();
    });
    expect(
      screen.getByTestId('basemap-switcher-trigger').getAttribute('title'),
    ).not.toBe('');
  });

  it('does not show basemap switcher tooltip when no SMP', () => {
    useMapStore.setState({ activeMapId: null });
    render(<MapContainer />);
    const trigger = screen.getByTestId('basemap-switcher-trigger');
    expect(trigger.getAttribute('title')).toBeFalsy();
  });

  // -------------------------------------------------------------------
  // Online active map style fallback (before SMP download completes)
  // -------------------------------------------------------------------

  it('uses active map style as network basemap when SMP not yet ready', async () => {
    useMapStore.setState({ activeMapId: 'map-draft' });
    mockDbGet.mockResolvedValue({
      id: 'map-draft',
      projectLocalId: 'proj-1',
      name: 'Draft Map',
      type: 'raster',
      styleUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
      status: 'draft',
    });
    render(<MapContainer />);
    // The placeholder is also an inline StyleSpecification, so wait for the
    // final online-active state rather than treating the first object style as ready.
    const badge = await screen.findByTestId('map-online-active-badge');
    // Should show online active badge with map name
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Active map.*online.*Draft Map/);
    // Should show tooltip on basemap switcher
    const trigger = screen.getByTestId('basemap-switcher-trigger');
    expect(trigger.getAttribute('title')).toBeTruthy();
  });

  it('falls through to store basemap when active map has no styleUrl', async () => {
    useMapStore.setState({ activeMapId: 'map-nostyle' });
    mockDbGet.mockResolvedValue({
      id: 'map-nostyle',
      projectLocalId: 'proj-1',
      name: 'No Style Map',
      status: 'draft',
      // intentionally no styleUrl
    });
    render(<MapContainer />);
    await waitFor(() =>
      expect(screen.getByTestId('mock-map').dataset.mapStyle).toContain(
        'cartocdn.com',
      ),
    );
    expect(
      screen.queryByTestId('map-online-active-badge'),
    ).not.toBeInTheDocument();
  });
});
