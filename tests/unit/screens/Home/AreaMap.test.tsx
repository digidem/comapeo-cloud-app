import { render, screen, userEvent } from '@tests/mocks/test-utils';
import type { FeatureCollection } from 'geojson';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AreaMap } from '@/screens/Home/AreaMap';

// Mock maplibre-gl CSS import
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

// Mock @turf/bbox
vi.mock('@turf/bbox', () => ({
  default: vi.fn((fc: FeatureCollection) => {
    if (fc.features.length === 0) return [0, 0, 0, 0];
    // Return a simple bounding box for test polygons
    return [-61, -4, -59, -2];
  }),
}));

// Track props passed to Source and Layer
const sourceProps: Array<Record<string, unknown>> = [];
const layerProps: Array<Record<string, unknown>> = [];

// Mock react-map-gl/maplibre
vi.mock('react-map-gl/maplibre', () => {
  return {
    default: ({
      children,
      onLoad,
    }: {
      children: React.ReactNode;
      onLoad?: () => void;
      ref?: unknown;
      initialViewState?: unknown;
      mapStyle?: unknown;
      interactive?: unknown;
    }) => {
      // Simulate map load on mount
      if (onLoad) {
        // Call synchronously to avoid act() warnings in tests
        onLoad();
      }
      return (
        <div data-testid="mock-map" ref={null}>
          {children}
        </div>
      );
    },
    Source: (props: Record<string, unknown>) => {
      sourceProps.push(props);
      return (
        <div
          data-testid={`mock-source-${props.id}`}
          data-source-id={props.id as string}
          data-source-type={props.type as string}
        >
          {props.children as React.ReactNode}
        </div>
      );
    },
    Layer: (props: Record<string, unknown>) => {
      layerProps.push(props);
      return (
        <div
          data-testid={`mock-layer-${props.id}`}
          data-layer-id={props.id as string}
          data-layer-type={props.type as string}
        />
      );
    },
  };
});

// Mock MapConfigSheet to avoid Radix Dialog portal issues in jsdom
vi.mock('@/screens/Home/MapConfigSheet', () => {
  return {
    MapConfigSheet: ({
      open,
      children,
      title,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
      title: string;
      closeLabel?: string;
    }) => {
      if (!open) return null;
      return (
        <div data-testid="mock-config-sheet" role="dialog" aria-label={title}>
          {children}
        </div>
      );
    },
  };
});

const TEST_POLYGON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-61, -4],
            [-59, -4],
            [-59, -2],
            [-61, -2],
            [-61, -4],
          ],
        ],
      },
    },
  ],
};

// Default: desktop mode for existing tests
function mockDesktopMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function mockMobileMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeAll(() => {
  mockDesktopMatchMedia();
});

describe('AreaMap', () => {
  it('renders without crashing when featureCollection is undefined', () => {
    render(<AreaMap />);
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
  });

  it('renders the Source with empty FeatureCollection fallback when featureCollection is undefined', () => {
    render(<AreaMap />);
    const source = screen.getByTestId('mock-source-calculated-area');
    expect(source).toBeInTheDocument();
    expect(source).toHaveAttribute('data-source-id', 'calculated-area');
    expect(source).toHaveAttribute('data-source-type', 'geojson');
  });

  it('passes the featureCollection data to Source when provided', () => {
    sourceProps.length = 0;
    render(<AreaMap featureCollection={TEST_POLYGON} />);
    const source = screen.getByTestId('mock-source-calculated-area');
    expect(source).toBeInTheDocument();
    // Verify the data prop was passed
    const lastSource = sourceProps[sourceProps.length - 1];
    expect(lastSource).toBeDefined();
    expect(lastSource!.data).toEqual(TEST_POLYGON);
  });

  it('renders both fill and line layers', () => {
    render(<AreaMap featureCollection={TEST_POLYGON} />);
    expect(screen.getByTestId('mock-layer-area-fill')).toBeInTheDocument();
    expect(screen.getByTestId('mock-layer-area-outline')).toBeInTheDocument();
  });

  it('passes correct paint properties to fill layer', () => {
    layerProps.length = 0;
    render(<AreaMap featureCollection={TEST_POLYGON} />);
    const fillLayer = layerProps.find((l) => l.id === 'area-fill');
    expect(fillLayer).toBeDefined();
    expect(fillLayer!.paint).toEqual({
      'fill-color': '#1F6FFF',
      'fill-opacity': 0.3,
      'fill-outline-color': '#04145C',
    });
  });

  it('passes correct paint properties to outline layer', () => {
    layerProps.length = 0;
    render(<AreaMap featureCollection={TEST_POLYGON} />);
    const outlineLayer = layerProps.find((l) => l.id === 'area-outline');
    expect(outlineLayer).toBeDefined();
    expect(outlineLayer!.paint).toEqual({
      'line-color': '#04145C',
      'line-width': 2,
    });
  });

  it('renders children in the desktop sidebar', () => {
    render(
      <AreaMap>
        <div data-testid="child-content">Settings Panel</div>
      </AreaMap>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Settings Panel')).toBeInTheDocument();
  });

  it('always renders Source (no conditional unmount) even without data', () => {
    render(<AreaMap featureCollection={undefined} />);
    // Source should always be present, not conditionally hidden
    expect(
      screen.getByTestId('mock-source-calculated-area'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('mock-layer-area-fill')).toBeInTheDocument();
    expect(screen.getByTestId('mock-layer-area-outline')).toBeInTheDocument();
  });

  it('uses key based on activeMethodId for Source remounting', () => {
    sourceProps.length = 0;
    const { rerender } = render(
      <AreaMap featureCollection={TEST_POLYGON} activeMethodId="observed" />,
    );

    // Rerender with a different method — key changes, so Source remounts
    rerender(
      <AreaMap featureCollection={TEST_POLYGON} activeMethodId="grid" />,
    );

    // The key prop causes a full Source remount which is reflected
    // in the mock by the Source being re-rendered with new props
    expect(sourceProps.length).toBeGreaterThanOrEqual(2);
  });

  it('renders every completed calculator layer and keeps the active layer on top', () => {
    sourceProps.length = 0;
    layerProps.length = 0;

    render(
      <AreaMap
        activeMethodId="grid"
        layers={[
          {
            id: 'grid',
            featureCollection: TEST_POLYGON,
            isActive: true,
          },
          {
            id: 'observed',
            featureCollection: TEST_POLYGON,
            isActive: false,
          },
        ]}
      />,
    );

    expect(
      screen.getByTestId('mock-source-calculated-area-observed'),
    ).toHaveAttribute('data-source-type', 'geojson');
    expect(
      screen.getByTestId('mock-source-calculated-area-grid'),
    ).toHaveAttribute('data-source-type', 'geojson');

    expect(
      layerProps
        .filter((layer) => String(layer.id).startsWith('area-fill-'))
        .map((layer) => layer.id)
        .slice(-2),
    ).toEqual(['area-fill-observed', 'area-fill-grid']);

    const activeOutline = layerProps.find(
      (layer) => layer.id === 'area-outline-grid',
    );
    expect(activeOutline?.paint).toMatchObject({
      'line-width': 3,
      'line-opacity': 0.95,
    });
  });

  it('container has responsive height classes', () => {
    render(<AreaMap />);
    const mapContainer = screen.getByTestId('area-map-container');
    expect(mapContainer.className).toContain('h-[min(60vh,500px)]');
    expect(mapContainer.className).toContain('sm:h-[400px]');
    expect(mapContainer.className).toContain('lg:h-[600px]');
  });

  it('container has full-width on mobile and card styling on desktop', () => {
    render(<AreaMap />);
    const mapContainer = screen.getByTestId('area-map-container');
    // Mobile: full-width with negative margins to punch through parent padding
    expect(mapContainer.className).toContain('-mx-3');
    expect(mapContainer.className).toContain('w-[calc(100%+1.5rem)]');
    // Card styling only on desktop (lg+)
    expect(mapContainer.className).toContain('lg:rounded-card');
    expect(mapContainer.className).toContain('lg:border');
    expect(mapContainer.className).toContain('lg:shadow-card');
  });

  it('map wrapper has flex-1 on desktop', () => {
    render(<AreaMap />);
    const mapWrapper = screen.getByTestId('mock-map')
      .parentElement as HTMLElement;
    expect(mapWrapper).toBeTruthy();
    expect(mapWrapper.className).toContain('h-full');
    expect(mapWrapper.className).toContain('flex-1');
    expect(mapWrapper.className).toContain('lg:min-w-0');
  });

  it('config panel has desktop sidebar classes', () => {
    render(
      <AreaMap>
        <div data-testid="config-child">Config</div>
      </AreaMap>,
    );
    const configPanel = screen.getByTestId('config-child')
      .parentElement as HTMLElement;
    expect(configPanel.className).toContain('lg:static');
    expect(configPanel.className).toContain('lg:w-96');
    expect(configPanel.className).toContain('lg:shrink-0');
    expect(configPanel.className).toContain('lg:overflow-y-auto');
  });

  it('desktop sidebar renders children without a sheet', () => {
    render(
      <AreaMap>
        <div data-testid="sidebar-child">Sidebar content</div>
      </AreaMap>,
    );
    expect(screen.getByTestId('sidebar-child')).toBeInTheDocument();
    // No mobile sheet should be rendered
    expect(screen.queryByTestId('mock-config-sheet')).not.toBeInTheDocument();
  });

  // --- Mobile-specific tests ---

  describe('mobile mode', () => {
    beforeEach(() => {
      mockMobileMatchMedia();
    });

    it('three-dots button is present when children are provided', () => {
      render(
        <AreaMap>
          <div data-testid="child">Content</div>
        </AreaMap>,
      );
      expect(screen.getByTestId('config-menu-button')).toBeInTheDocument();
    });

    it('three-dots button is NOT present when children are not provided', () => {
      render(<AreaMap />);
      expect(
        screen.queryByTestId('config-menu-button'),
      ).not.toBeInTheDocument();
    });

    it('three-dots button has correct aria-label', () => {
      render(
        <AreaMap>
          <div>Content</div>
        </AreaMap>,
      );
      const btn = screen.getByTestId('config-menu-button');
      expect(btn).toHaveAttribute('aria-label', 'Map settings');
    });

    it('three-dots button has lg:hidden class', () => {
      render(
        <AreaMap>
          <div>Content</div>
        </AreaMap>,
      );
      const btn = screen.getByTestId('config-menu-button');
      expect(btn.className).toContain('lg:hidden');
    });

    it('clicking three-dots button opens the config sheet', async () => {
      const user = userEvent.setup();
      render(
        <AreaMap>
          <div data-testid="sheet-child">Sheet content</div>
        </AreaMap>,
      );

      // Sheet should not be visible initially
      expect(screen.queryByTestId('mock-config-sheet')).not.toBeInTheDocument();

      // Click the three-dots button
      await user.click(screen.getByTestId('config-menu-button'));

      // Sheet should now be visible
      expect(screen.getByTestId('mock-config-sheet')).toBeInTheDocument();
    });

    it('config children are visible inside the sheet when open', async () => {
      const user = userEvent.setup();
      render(
        <AreaMap>
          <div data-testid="sheet-child">Sheet content</div>
        </AreaMap>,
      );

      await user.click(screen.getByTestId('config-menu-button'));

      expect(screen.getByTestId('sheet-child')).toBeInTheDocument();
    });

    it('config children are NOT visible when sheet is closed', () => {
      render(
        <AreaMap>
          <div data-testid="sheet-child">Sheet content</div>
        </AreaMap>,
      );

      // On mobile, children are inside the sheet which starts closed
      expect(screen.queryByTestId('sheet-child')).not.toBeInTheDocument();
    });
  });
});
