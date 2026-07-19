import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

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

vi.mock('react-map-gl/maplibre', () => ({
  default: React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MockMap(props, _ref) {
      mapProps.push(props);
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
  AttributionControl: () => null,
}));

describe('MapScreen', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    mapProps.length = 0;
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

  it('renders the authoring canvas and desktop controls for the selected project', async () => {
    render(<MapScreen />);

    expect(
      await screen.findByRole('region', { name: 'Map authoring canvas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Base map')).toBeInTheDocument();
    expect(screen.getByText('Bounds')).toBeInTheDocument();
    expect(screen.getByText('Zoom range')).toBeInTheDocument();
    expect(screen.getByText('Saved maps')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Draw bounds' }),
    ).toBeInTheDocument();
  });

  describe('mobile settings sheet', () => {
    let originalWidth: number;

    beforeEach(() => {
      originalWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalWidth,
      });
    });

    it('mounts controls exactly once when sheet is opened — no duplicate aside', async () => {
      const user = userEvent.setup();
      render(<MapScreen />);

      // Wait for loading to finish
      const settingsButton = await screen.findByRole('button', {
        name: 'Map settings',
      });

      // On mobile the aside is not mounted, so controls are absent when sheet is closed
      expect(
        screen.queryByRole('heading', { name: 'Bounds', level: 2 }),
      ).not.toBeInTheDocument();

      // Open the mobile settings sheet
      await user.click(settingsButton);

      // Controls appear exactly once
      expect(
        screen.getAllByRole('heading', { name: 'Bounds', level: 2 }),
      ).toHaveLength(1);
    });
  });

  it('updates the canvas map style when the selected style changes', async () => {
    const user = userEvent.setup();

    render(<MapScreen />);

    expect(await screen.findByTestId('mock-authoring-map')).toHaveAttribute(
      'data-map-style',
      expect.stringContaining('cartocdn.com'),
    );

    await user.click(
      await screen.findByRole('button', { name: 'OpenStreetMap' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-authoring-map')).toHaveAttribute(
        'data-map-style',
        'StyleSpecification',
      );
    });
  });

  it('shows a save error and keeps the name dialog open when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(getDb().maps, 'add').mockRejectedValueOnce(
      new Error('IndexedDB write failed'),
    );

    render(<MapScreen />);

    await user.click(
      (await screen.findAllByRole('button', { name: 'Save Map' })).at(-1)!,
    );
    await user.type(await screen.findByLabelText('Map name'), 'Field map');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText('Could not save map. Please try again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Save map' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Map name')).toHaveValue('Field map');
  });
});
