import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { getDb, resetDb } from '@/lib/db';
import { MAX_GEOJSON_OVERLAY_BYTES } from '@/lib/map/geojson-overlays';
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
    expect(screen.getByText('Reference data')).toBeInTheDocument();
    expect(screen.getByText('Zoom range')).toBeInTheDocument();
    expect(screen.getByText('Saved maps')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Draw bounds' }),
    ).toBeInTheDocument();
  });

  it('adds multiple reference overlays and supports visibility and removal', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    const input = await screen.findByLabelText('Add GeoJSON reference');
    const pointFile = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'point.geojson',
      { type: 'application/geo+json' },
    );
    const lineFile = new File(
      ['{"type":"LineString","coordinates":[[-60,-3],[-59,-2]]}'],
      'route.geojson',
      { type: 'application/geo+json' },
    );

    await user.upload(input, [pointFile, lineFile]);

    expect(await screen.findByText('point.geojson')).toBeInTheDocument();
    expect(screen.getByText('route.geojson')).toBeInTheDocument();
    expect(
      screen.getAllByTestId(/mock-source-reference-overlay-.*/),
    ).toHaveLength(2);

    await user.click(
      screen.getByRole('button', { name: 'Hide point.geojson' }),
    );
    expect(
      screen.getAllByTestId(/mock-source-reference-overlay-.*/),
    ).toHaveLength(2);

    await user.click(
      screen.getByRole('button', { name: 'Remove route.geojson' }),
    );
    expect(screen.queryByText('route.geojson')).not.toBeInTheDocument();
  });

  it('keeps import loading active until overlapping picker and drop imports both finish', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const firstRead = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRead = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const firstFile = new File([], 'first.geojson', {
      type: 'application/geo+json',
    });
    const secondFile = new File([], 'second.geojson', {
      type: 'application/geo+json',
    });
    Object.defineProperty(firstFile, 'text', {
      value: vi.fn(() => firstRead),
    });
    Object.defineProperty(secondFile, 'text', {
      value: vi.fn(() => secondRead),
    });

    await user.upload(
      await screen.findByLabelText('Add GeoJSON reference'),
      firstFile,
    );
    expect(await screen.findByText('Adding GeoJSON…')).toBeInTheDocument();

    fireEvent.drop(
      screen.getByRole('region', { name: 'Map authoring canvas' }),
      {
        dataTransfer: { types: ['Files'], files: [secondFile] },
      },
    );

    await act(async () => {
      resolveFirst('{"type":"Point","coordinates":[-60,-3]}');
      await firstRead;
    });
    expect(await screen.findByText('first.geojson')).toBeInTheDocument();
    expect(screen.getByText('Adding GeoJSON…')).toBeInTheDocument();

    await act(async () => {
      resolveSecond('{"type":"Point","coordinates":[-59,-2]}');
      await secondRead;
    });
    expect(await screen.findByText('second.geojson')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Adding GeoJSON…')).not.toBeInTheDocument();
    });
  });

  it('does not surface a stale older failure after a newer import already succeeded', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const firstRead = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRead = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const firstFile = new File([], 'broken-first.geojson', {
      type: 'application/geo+json',
    });
    const secondFile = new File([], 'valid-second.geojson', {
      type: 'application/geo+json',
    });
    Object.defineProperty(firstFile, 'text', {
      value: vi.fn(() => firstRead),
    });
    Object.defineProperty(secondFile, 'text', {
      value: vi.fn(() => secondRead),
    });

    await user.upload(
      await screen.findByLabelText('Add GeoJSON reference'),
      firstFile,
    );
    fireEvent.drop(
      screen.getByRole('region', { name: 'Map authoring canvas' }),
      { dataTransfer: { types: ['Files'], files: [secondFile] } },
    );

    await act(async () => {
      resolveSecond('{"type":"Point","coordinates":[-59,-2]}');
      await secondRead;
    });
    expect(await screen.findByText('valid-second.geojson')).toBeInTheDocument();

    await act(async () => {
      resolveFirst('{"type":"Point","coordinates":["bad",0]}');
      await firstRead;
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an older failure while a newer import is pending, then clears it when the newer import succeeds', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const firstRead = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRead = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const firstFile = new File([], 'broken-first.geojson', {
      type: 'application/geo+json',
    });
    const secondFile = new File([], 'valid-second.geojson', {
      type: 'application/geo+json',
    });
    Object.defineProperty(firstFile, 'text', {
      value: vi.fn(() => firstRead),
    });
    Object.defineProperty(secondFile, 'text', {
      value: vi.fn(() => secondRead),
    });

    await user.upload(
      await screen.findByLabelText('Add GeoJSON reference'),
      firstFile,
    );
    fireEvent.drop(
      screen.getByRole('region', { name: 'Map authoring canvas' }),
      { dataTransfer: { types: ['Files'], files: [secondFile] } },
    );

    await act(async () => {
      resolveFirst('{"type":"Point","coordinates":["bad",0]}');
      await firstRead;
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'broken-first.geojson is not valid GeoJSON.',
    );

    await act(async () => {
      resolveSecond('{"type":"Point","coordinates":[-59,-2]}');
      await secondRead;
    });
    expect(await screen.findByText('valid-second.geojson')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('rejects an invalid multi-file batch without adding partial overlay state', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    const input = await screen.findByLabelText('Add GeoJSON reference');
    const validFile = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'valid.geojson',
      { type: 'application/geo+json' },
    );
    const invalidFile = new File(
      ['{"type":"Point","coordinates":["bad",0]}'],
      'broken.geojson',
      {
        type: 'application/geo+json',
      },
    );

    await user.upload(input, [validFile, invalidFile]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'broken.geojson is not valid GeoJSON. No files from this selection were added.',
    );
    expect(screen.queryByText('valid.geojson')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(/mock-source-reference-overlay-.*-points/),
    ).not.toBeInTheDocument();
  });

  it('explains invalid polygon rings instead of reporting only generic GeoJSON failure', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    await user.upload(
      await screen.findByLabelText('Add GeoJSON reference'),
      new File(
        [
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-61, -4],
                [-59, -4],
                [-59, -2],
                [-61, -3],
              ],
            ],
          }),
        ],
        'unclosed.geojson',
        { type: 'application/geo+json' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'unclosed.geojson has invalid polygon rings.',
    );
  });

  it('maps unsupported, oversized, and wrong-file errors to user-visible messages', async () => {
    const user = userEvent.setup();
    render(<MapScreen />);

    const input = await screen.findByLabelText('Add GeoJSON reference');
    await user.upload(
      input,
      new File(
        ['{"type":"FeatureCollection","features":[]}'],
        'empty.geojson',
        {
          type: 'application/geo+json',
        },
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'empty.geojson has no supported geometry to display.',
    );

    const oversized = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'large.geojson',
      { type: 'application/geo+json' },
    );
    Object.defineProperty(oversized, 'size', {
      value: MAX_GEOJSON_OVERLAY_BYTES + 1,
    });
    await user.upload(input, oversized);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'large.geojson is larger than 5 MB.',
    );

    const wrongFile = new File(['not geojson'], 'photo.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.drop(
      screen.getByRole('region', { name: 'Map authoring canvas' }),
      { dataTransfer: { types: ['Files'], files: [wrongFile] } },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'photo.jpg is not a GeoJSON or JSON file.',
    );
  });

  it('shows drag-and-drop import failures on the map even when controls are out of view', async () => {
    render(<MapScreen />);
    const brokenFile = new File(
      ['{"type":"Point","coordinates":["bad",0]}'],
      'dropped-broken.geojson',
      { type: 'application/geo+json' },
    );

    fireEvent.drop(
      await screen.findByRole('region', { name: 'Map authoring canvas' }),
      { dataTransfer: { types: ['Files'], files: [brokenFile] } },
    );

    const mapAlert = await screen.findByTestId('reference-overlay-map-error');
    expect(mapAlert).toHaveTextContent(
      'dropped-broken.geojson is not valid GeoJSON.',
    );
  });

  it('clears transient reference overlays when the selected project changes', async () => {
    const user = userEvent.setup();
    await getDb().projects.add({
      localId: 'project-2',
      sourceType: 'local',
      sourceId: 'local-2',
      name: 'Second Project',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });
    render(<MapScreen />);

    const input = await screen.findByLabelText('Add GeoJSON reference');
    await user.upload(
      input,
      new File(
        ['{"type":"Point","coordinates":[-60,-3]}'],
        'project-1.geojson',
        { type: 'application/geo+json' },
      ),
    );
    expect(await screen.findByText('project-1.geojson')).toBeInTheDocument();

    act(() => {
      useProjectStore.setState({ selectedProjectId: 'project-2' });
    });

    await waitFor(() => {
      expect(screen.queryByText('project-1.geojson')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(/mock-source-reference-overlay-.*/),
    ).not.toBeInTheDocument();
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

    it('shows invalid GeoJSON errors inside the mobile settings sheet', async () => {
      const user = userEvent.setup();
      render(<MapScreen />);

      await user.click(
        await screen.findByRole('button', { name: 'Map settings' }),
      );
      const input = screen.getByLabelText('Add GeoJSON reference');
      await user.upload(
        input,
        new File(
          ['{"type":"Point","coordinates":["bad",0]}'],
          'broken.geojson',
          { type: 'application/geo+json' },
        ),
      );

      const settingsDialog = screen.getByRole('dialog', {
        name: 'Map settings',
      });
      expect(
        await within(settingsDialog).findByRole('alert'),
      ).toHaveTextContent('broken.geojson is not valid GeoJSON.');
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

      // Open the Map settings sheet so both floating and sheet Save Map
      // triggers exist in the DOM at the same time (mobile viewport).
      // Use { hidden: true } because Radix Dialog sets aria-hidden on
      // the main content when the sheet is open.
      await user.click(
        await screen.findByRole('button', {
          name: 'Map settings',
          hidden: true,
        }),
      );

      // Change basemap so both Save Map buttons are enabled
      await user.click(
        await screen.findByRole('button', { name: 'OpenStreetMap' }),
      );

      // Confirm both triggers exist before starting the save flow
      // (floating quick-action + settings-sheet trigger)
      const allSaveButtons = await screen.findAllByRole('button', {
        name: 'Save Map',
        hidden: true,
      });
      expect(allSaveButtons.length).toBeGreaterThanOrEqual(2);

      // Close the settings sheet — both triggers are proven; now exercise
      // the floating quick-action path through the name dialog.
      await user.click(
        screen.getByRole('button', { name: 'Close map settings' }),
      );

      // Trigger save via the floating quick-action button (bottom-right, mobile)
      await user.click(await screen.findByRole('button', { name: 'Save Map' }));
      await user.type(await screen.findByLabelText('Map name'), 'Field map');
      await user.click(screen.getByRole('button', { name: 'Save draft' }));

      // Dismiss the dialog (Cancel) so the trigger buttons are visible again.
      // The mutation is still pending — handleSaveMap awaits mutateAsync
      // before closing, so the dialog stays open until we force-close.
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Reopen the settings sheet while the mutation is still pending so
      // both triggers are present in the DOM again.
      await user.click(
        await screen.findByRole('button', {
          name: 'Map settings',
          hidden: true,
        }),
      );

      // BOTH Save Map triggers disabled while createMap is pending:
      // query with { hidden: true } because Radix aria-hides the sheet
      // content behind the floating quick-action trigger.
      const pendingButtons = await screen.findAllByRole('button', {
        name: 'Save Map',
        hidden: true,
      });
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
          hidden: true,
        });
        for (const btn of resolvedButtons) {
          expect(btn).toBeEnabled();
        }
      });
    });

    it('floating Save Map is enabled at default config while settings-sheet Save Map is disabled', async () => {
      const user = userEvent.setup();
      render(<MapScreen />);

      // Floating quick-action Save Map (always visible on mobile when not
      // in draw mode) is ENABLED at defaults — intentional, see the
      // "Intentionally no !hasConfigChanges guard" comment in MapScreen.tsx.
      const floatingSave = await screen.findByRole('button', {
        name: 'Save Map',
      });
      expect(floatingSave).toBeEnabled();

      // Open the settings sheet
      await user.click(
        await screen.findByRole('button', {
          name: 'Map settings',
          hidden: true,
        }),
      );

      // Settings-sheet Save Map is DISABLED at defaults
      const allSaves = screen.getAllByRole('button', {
        name: 'Save Map',
        hidden: true,
      });
      const settingsSheetSave = allSaves.find((btn) => btn !== floatingSave);
      expect(settingsSheetSave).toBeDisabled();

      // Change basemap — the settings-sheet trigger becomes enabled
      await user.click(
        await screen.findByRole('button', { name: 'OpenStreetMap' }),
      );
      await waitFor(() => {
        expect(settingsSheetSave!).toBeEnabled();
      });
    });

    it('resets draw mode when clicking the cancel button during draw_rectangle', async () => {
      const user = userEvent.setup();
      render(<MapScreen />);

      await user.click(
        await screen.findByRole('button', { name: 'Draw bounds' }),
      );

      // Confirm draw mode is active
      expect(
        await screen.findByRole('button', { name: 'Set this area' }),
      ).toBeInTheDocument();

      // Click the frame instruction bar's cancel button
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      // Draw mode exits
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Set this area' }),
        ).not.toBeInTheDocument();
      });
    });

    it('renders DownloadPanel for maps with downloadable status', async () => {
      const user = userEvent.setup();

      // Seed a draft map so the DownloadPanel IIFE renders
      await getDb().maps.add({
        id: 'draft-map-1',
        projectLocalId: 'project-1',
        name: 'Offline Forest',
        type: 'raster',
        styleUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
        bbox: [-75, -12, -45, 8],
        minZoom: 0,
        maxZoom: 14,
        status: 'draft',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      });

      render(<MapScreen />);

      // Open the mobile settings sheet so renderControls() runs (controls
      // are only rendered inside the sheet on mobile).
      await user.click(
        await screen.findByRole('button', { name: 'Map settings' }),
      );

      // DownloadPanel renders with the map name
      const downloadPanel = await screen.findByTestId('download-panel');
      expect(
        within(downloadPanel).getByText('Offline Forest'),
      ).toBeInTheDocument();
    });

    it('shows a name-required error and keeps the dialog open when submitting an empty name', async () => {
      const user = userEvent.setup();

      render(<MapScreen />);

      // Open settings sheet and change basemap so Save Map is enabled
      await user.click(
        await screen.findByRole('button', {
          name: 'Map settings',
          hidden: true,
        }),
      );
      await user.click(
        await screen.findByRole('button', { name: 'OpenStreetMap' }),
      );

      // Click the settings-sheet Save Map button
      const allSaves = await screen.findAllByRole('button', {
        name: 'Save Map',
        hidden: true,
      });
      await user.click(allSaves[allSaves.length - 1]!);

      // Dialog opens with empty name field
      const nameInput = await screen.findByLabelText('Map name');
      expect(nameInput).toHaveValue('');

      // Click "Save draft" with empty name — should show error, keep dialog open
      await user.click(screen.getByRole('button', { name: 'Save draft' }));

      expect(await screen.findByText('Enter a map name')).toBeInTheDocument();
      expect(
        screen.getByRole('dialog', { name: 'Save map' }),
      ).toBeInTheDocument();
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

  it('shows the no-project empty state when the selected project does not exist', async () => {
    // Point at a project ID that isn't in the DB
    useProjectStore.setState({ selectedProjectId: 'nonexistent-project' });

    render(<MapScreen />);

    // The empty-state message appears with a link back to home
    expect(
      await screen.findByText('Select a project from Home to author maps'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Home' }),
    ).toBeInTheDocument();
  });
});

describe('MapScreen frame drawing (mobile)', () => {
  let originalWidth: number;

  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    mapProps.length = 0;
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

  it('confirms a valid frame and shows the undo banner with the previous bbox', async () => {
    const user = userEvent.setup();

    // Mock unproject to return a valid frame that does NOT cross the antimeridian
    // and is NOT zero-area. The default bbox is [-75, -12, -45, 8], so the
    // new bbox should be different (otherwise undo has nothing to revert to).
    unprojectMock
      .mockImplementationOnce(() => ({ lng: -80, lat: 10 }))
      .mockImplementationOnce(() => ({ lng: -50, lat: 10 }))
      .mockImplementationOnce(() => ({ lng: -50, lat: -10 }))
      .mockImplementationOnce(() => ({ lng: -80, lat: -10 }));

    render(<MapScreen />);

    // Enter draw_rectangle mode
    await user.click(
      await screen.findByRole('button', { name: 'Draw bounds' }),
    );

    // Confirm the frame — this triggers handleConfirmFrame's happy path
    await user.click(
      await screen.findByRole('button', { name: 'Set this area' }),
    );

    // Draw mode resets and the undo banner appears
    expect(await screen.findByText('Map area updated')).toBeInTheDocument();

    // Clicking Undo reverts to the previous bbox
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(screen.queryByText('Map area updated')).not.toBeInTheDocument();
    });
  });
});
