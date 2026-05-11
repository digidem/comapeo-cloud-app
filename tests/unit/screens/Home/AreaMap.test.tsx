import { render, screen } from '@tests/mocks/test-utils';
import type { FeatureCollection } from 'geojson';
import { describe, expect, it, vi } from 'vitest';

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

  it('renders children in the settings overlay', () => {
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
    const { container } = render(<AreaMap />);
    const mapContainer = container.firstElementChild as HTMLElement;
    expect(mapContainer.className).toContain('h-[300px]');
    expect(mapContainer.className).toContain('sm:h-[400px]');
    expect(mapContainer.className).toContain('lg:h-[600px]');
  });

  it('overlay container exists and renders children', () => {
    render(
      <AreaMap>
        <div data-testid="overlay-child">Overlay content</div>
      </AreaMap>,
    );
    expect(screen.getByTestId('overlay-child')).toBeInTheDocument();
  });
});
