import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from '@tests/mocks/test-utils';
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

describe('MapScreen', () => {
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

  it('moves compact map attribution to the bottom-left', async () => {
    render(<MapScreen />);

    await screen.findByTestId('mock-authoring-map');

    expect(mapProps.at(-1)).toMatchObject({ attributionControl: false });
    expect(attributionControlProps.at(-1)).toMatchObject({
      compact: true,
      position: 'top-left',
    });
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

    it('rejects a frame confirm that crosses the antimeridian instead of drawing an inverted bbox', async () => {
      const user = userEvent.setup();
      unprojectMock
        .mockImplementationOnce(() => ({ lng: 175, lat: 10 }))
        .mockImplementationOnce(() => ({ lng: 185, lat: 10 }))
        .mockImplementationOnce(() => ({ lng: 185, lat: -10 }))
        .mockImplementationOnce(() => ({ lng: 175, lat: -10 }));

      render(<MapScreen />);

      await user.click(
        await screen.findByRole('button', { name: 'Draw bounds' }),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Set this area' }),
      );

      expect(
        await screen.findByText('Selection cannot cross the 180° meridian.'),
      ).toBeInTheDocument();
      // Frame stays in draw mode instead of confirming an inverted bbox
      expect(screen.queryByText('Map area updated')).not.toBeInTheDocument();
    });
    it('closes the settings sheet when opening the name dialog on mobile', async () => {
      const user = userEvent.setup();

      render(<MapScreen />);

      // Open settings sheet via the mobile Settings button
      await user.click(
        await screen.findByRole('button', { name: 'Map settings' }),
      );

      // Change basemap so the Save Map button is enabled
      await user.click(
        await screen.findByRole('button', { name: 'OpenStreetMap' }),
      );

      // Click the settings sheet Save Map button (last in DOM order)
      const saveButtons = await screen.findAllByRole('button', {
        name: 'Save Map',
      });
      await user.click(saveButtons[saveButtons.length - 1]!);

      // The name dialog should be open
      expect(
        await screen.findByRole('dialog', { name: 'Save map' }),
      ).toBeInTheDocument();

      // The settings sheet should be closed — only one dialog should exist
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
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

    // Change something from defaults so the settings sheet Save Map button is enabled
    await user.click(
      await screen.findByRole('button', { name: 'OpenStreetMap' }),
    );

    await user.click(
      (await screen.findAllByRole('button', { name: 'Save Map' })).slice(
        -1,
      )[0]!,
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

  it('disables the settings sheet Save Map button when nothing has been configured', async () => {
    const user = userEvent.setup();

    render(<MapScreen />);

    // With default bbox, zoom, and basemap, the settings sheet button
    // (last Save Map button in DOM order) should be disabled.
    const saveButtons = await screen.findAllByRole('button', {
      name: 'Save Map',
    });
    const settingsSheetButton = saveButtons[saveButtons.length - 1]!;
    expect(settingsSheetButton).toBeDisabled();

    // After changing the basemap, the button should become enabled
    await user.click(screen.getByRole('button', { name: 'OpenStreetMap' }));
    expect(settingsSheetButton).toBeEnabled();
  });

  it('disables both Save Map triggers (floating + settings-sheet) while a save mutation is pending', async () => {
    const user = userEvent.setup();

    // Deferred promise keeps the mutation pending until we resolve it
    let resolveAdd: (value: string) => void;
    const pendingPromise = new Promise<string>((resolve) => {
      resolveAdd = resolve;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie's PromiseExtended vs standard Promise
    vi.spyOn(getDb().maps, 'add').mockReturnValueOnce(pendingPromise as any);

    render(<MapScreen />);

    // Change basemap so both Save Map buttons are enabled
    await user.click(
      await screen.findByRole('button', { name: 'OpenStreetMap' }),
    );

    // Confirm both triggers exist before starting the save flow
    const allSaveButtons = await screen.findAllByRole('button', {
      name: 'Save Map',
    });
    expect(allSaveButtons.length).toBeGreaterThanOrEqual(2);

    // Trigger save via the settings-sheet button (last in DOM order)
    await user.click(allSaveButtons[allSaveButtons.length - 1]!);
    await user.type(await screen.findByLabelText('Map name'), 'Field map');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    // Dismiss the dialog (Cancel) so the trigger buttons are visible again.
    // The mutation is still pending — handleSaveMap awaits mutateAsync
    // before closing, so the dialog stays open until we force-close.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // BOTH Save Map buttons should be disabled while createMap is pending:
    // 1) floating quick action (bottom-right, mobile)
    // 2) settings-sheet trigger (inside aside / sheet)
    const pendingButtons = screen.getAllByRole('button', { name: 'Save Map' });
    expect(pendingButtons.length).toBeGreaterThanOrEqual(2);
    for (const btn of pendingButtons) {
      expect(btn).toBeDisabled();
    }

    // Resolve the mutation inside act() so React state updates are flushed
    await act(async () => {
      resolveAdd!('done');
    });

    // BOTH buttons re-enable after the mutation settles
    await waitFor(() => {
      const resolvedButtons = screen.getAllByRole('button', {
        name: 'Save Map',
      });
      for (const btn of resolvedButtons) {
        expect(btn).toBeEnabled();
      }
    });
  });
});
