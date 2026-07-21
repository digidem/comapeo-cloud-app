import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import { useMapStore } from '@/stores/map-store';

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
const mockRegisterSmpProtocol = vi.fn();

vi.mock('@/lib/map/smp-serve', () => ({
  resolveSmpStyle: (...args: unknown[]) => mockResolveSmpStyle(...args),
  getSmpReader: (...args: unknown[]) => mockGetSmpReader(...args),
  registerSmpProtocol: (...args: unknown[]) => mockRegisterSmpProtocol(...args),
  closeSmpReader: vi.fn().mockResolvedValue(undefined),
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
  useMapStore.setState({ basemapId: 'carto-positron' });
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

  it('does not render active offline map badge when no active map', () => {
    useMapStore.setState({ activeMapId: null });
    render(<MapContainer />);
    expect(
      screen.queryByTestId('map-active-map-badge'),
    ).not.toBeInTheDocument();
  });

  it('falls back to basemap when activeSavedMap has no smpBlob', async () => {
    useMapStore.setState({ activeMapId: 'map-2' });
    mockDbGet.mockResolvedValue({
      id: 'map-2',
      projectLocalId: 'proj-1',
      name: 'Incomplete Map',
      status: 'ready',
      // no smpBlob
    });
    render(<MapContainer />);
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toContain('cartocdn.com');
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
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toContain('cartocdn.com');
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
    await waitFor(() => {
      const mapEl = screen.getByTestId('mock-map');
      expect(mapEl.dataset.mapStyle).toBe('StyleSpecification');
    });
    // Should show online active badge
    expect(screen.getByTestId('map-online-active-badge')).toBeInTheDocument();
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
    const mapEl = screen.getByTestId('mock-map');
    expect(mapEl.dataset.mapStyle).toContain('cartocdn.com');
    expect(
      screen.queryByTestId('map-online-active-badge'),
    ).not.toBeInTheDocument();
  });
});
