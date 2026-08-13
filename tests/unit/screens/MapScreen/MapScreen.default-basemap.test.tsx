// Test for issue #153: MapScreen should default to CartoDB Positron basemap
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { getDb, resetDb } from '@/lib/db';
import { MapScreen } from '@/screens/MapScreen/MapScreen';
import { useProjectStore } from '@/stores/project-store';

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => false,
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
const unprojectMock = vi.fn((point: [number, number]) => ({
  lng: point[0],
  lat: point[1],
}));

interface MockMapHandle {
  getMap: () => {
    getCanvas: () => { clientWidth: number; clientHeight: number };
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
      React.useImperativeHandle(ref, () => ({
        getMap: () => ({
          getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
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

function getConfigSaveButton() {
  const button = screen
    .getAllByRole('button', { name: 'Save Map', hidden: true })
    .find((candidate) => candidate.classList.contains('w-full'));
  if (!button) throw new Error('Map configuration Save Map button not found');
  return button;
}

describe('MapScreen - default basemap (issue #153)', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    mapProps.length = 0;
    attributionControlProps.length = 0;
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
  });

  it('renders with CartoDB Positron as the default basemap', async () => {
    render(<MapScreen />);

    // Wait for the map to render
    await screen.findByTestId('mock-authoring-map');

    // The map style should contain the CartoDB Positron style URL
    expect(mapProps.length).toBeGreaterThan(0);
    const lastMapProps = mapProps[mapProps.length - 1]!;
    const mapStyle = lastMapProps.mapStyle;

    // For vector style basemaps (like CartoDB Positron), mapStyle is a URL string
    if (typeof mapStyle === 'string') {
      expect(mapStyle).toContain('cartocdn.com/gl/positron-gl-style');
    } else {
      // For raster basemaps, mapStyle is a StyleSpecification object
      // with sources containing the tile URL
      if (
        typeof mapStyle === 'object' &&
        mapStyle !== null &&
        'sources' in mapStyle
      ) {
        const sources = (mapStyle as { sources: Record<string, unknown> })
          .sources;
        const positronSource = sources['carto-positron'];
        expect(positronSource).toBeDefined();
      }
    }
  });

  it('hasConfigChanges should be false at default config (CartoDB Positron + DEFAULT_BBOX + DEFAULT_ZOOM)', async () => {
    // This test verifies that hasConfigChanges correctly compares against
    // the defaults (CartoDB Positron) instead of the old defaults
    render(<MapScreen />);

    await screen.findByTestId('mock-authoring-map');

    // Open settings sheet to access the Save Map button
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Map settings', hidden: true }),
    );

    // The map-configuration Save Map should be disabled at defaults.
    // Select it by its full-width control styling rather than DOM order,
    // because the mobile quick-save is intentionally always enabled.
    expect(getConfigSaveButton()).toBeDisabled();
  });
});
