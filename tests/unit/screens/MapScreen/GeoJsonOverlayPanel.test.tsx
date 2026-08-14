import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { GeoJsonOverlayPanel } from '@/screens/MapScreen/GeoJsonOverlayPanel';
import type { GeoJsonOverlay } from '@/screens/MapScreen/OverlayLayers';

// Mock uuid so overlay ids are deterministic in tests.
vi.mock('@/lib/uuid', () => ({
  uuid: vi.fn(() => 'test-uuid'),
}));

function makeFile(
  content: string | object,
  name = 'overlay.geojson',
  type = 'application/geo+json',
): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], name, { type });
}

function validPointGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ],
  };
}

function validPolygonGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  };
}

describe('GeoJsonOverlayPanel', () => {
  let onAdd: Mock;
  let onToggleVisibility: Mock;
  let onRemove: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    onAdd = vi.fn();
    onToggleVisibility = vi.fn();
    onRemove = vi.fn();
  });

  it('renders the title, description, and add button', () => {
    render(
      <GeoJsonOverlayPanel
        overlays={[]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('Reference overlays')).toBeInTheDocument();
    expect(screen.getByText('Add GeoJSON overlay')).toBeInTheDocument();
  });

  it('adds a valid GeoJSON overlay via the file picker', async () => {
    const user = userEvent.setup();
    render(
      <GeoJsonOverlayPanel
        overlays={[]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    const input = screen.getByLabelText('GeoJSON overlay file');
    await user.upload(input, makeFile(validPointGeoJson()));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
    const added = onAdd.mock.calls[0]![0] as GeoJsonOverlay;
    expect(added.fileName).toBe('overlay.geojson');
    expect(added.visible).toBe(true);
    expect(added.data.type).toBe('FeatureCollection');
  });

  it('adds multiple files at once via the file picker', async () => {
    const user = userEvent.setup();
    render(
      <GeoJsonOverlayPanel
        overlays={[]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    const input = screen.getByLabelText('GeoJSON overlay file');
    await user.upload(input, [
      makeFile(validPointGeoJson(), 'a.geojson'),
      makeFile(validPolygonGeoJson(), 'b.geojson'),
    ]);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(2);
    });
    expect(onAdd.mock.calls[0]![0].fileName).toBe('a.geojson');
    expect(onAdd.mock.calls[1]![0].fileName).toBe('b.geojson');
  });

  it('shows a user-visible error for invalid JSON and adds no overlay', async () => {
    const user = userEvent.setup();
    render(
      <GeoJsonOverlayPanel
        overlays={[]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    const input = screen.getByLabelText('GeoJSON overlay file');
    await user.upload(input, makeFile('{ not valid json'));

    await waitFor(() => {
      expect(screen.getByText('File is not valid JSON.')).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows a user-visible error for invalid GeoJSON and adds no overlay', async () => {
    const user = userEvent.setup();
    render(
      <GeoJsonOverlayPanel
        overlays={[]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    const input = screen.getByLabelText('GeoJSON overlay file');
    await user.upload(input, makeFile({ foo: 'bar' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'File is not valid GeoJSON. Use FeatureCollection, Feature, or a Geometry.',
        ),
      ).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('renders existing overlays with filename, visibility toggle, and remove', () => {
    const overlay: GeoJsonOverlay = {
      id: 'ov1',
      fileName: 'territory.geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
      visible: true,
    };
    render(
      <GeoJsonOverlayPanel
        overlays={[overlay]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('territory.geojson')).toBeInTheDocument();
    expect(screen.getByLabelText('Hide overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove overlay')).toBeInTheDocument();
  });

  it('calls onToggleVisibility when the visibility button is clicked', async () => {
    const user = userEvent.setup();
    const overlay: GeoJsonOverlay = {
      id: 'ov1',
      fileName: 'territory.geojson',
      data: { type: 'FeatureCollection', features: [] },
      visible: true,
    };
    render(
      <GeoJsonOverlayPanel
        overlays={[overlay]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByLabelText('Hide overlay'));
    expect(onToggleVisibility).toHaveBeenCalledWith('ov1');
  });

  it('calls onRemove when the remove button is clicked', async () => {
    const user = userEvent.setup();
    const overlay: GeoJsonOverlay = {
      id: 'ov1',
      fileName: 'territory.geojson',
      data: { type: 'FeatureCollection', features: [] },
      visible: true,
    };
    render(
      <GeoJsonOverlayPanel
        overlays={[overlay]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByLabelText('Remove overlay'));
    expect(onRemove).toHaveBeenCalledWith('ov1');
  });

  it('shows the "show" label when overlay is hidden', () => {
    const overlay: GeoJsonOverlay = {
      id: 'ov1',
      fileName: 'territory.geojson',
      data: { type: 'FeatureCollection', features: [] },
      visible: false,
    };
    render(
      <GeoJsonOverlayPanel
        overlays={[overlay]}
        onAdd={onAdd}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByLabelText('Show overlay')).toBeInTheDocument();
  });

  describe('drag and drop', () => {
    it('adds a valid file dropped onto the drop zone', async () => {
      render(
        <GeoJsonOverlayPanel
          overlays={[]}
          onAdd={onAdd}
          onToggleVisibility={onToggleVisibility}
          onRemove={onRemove}
        />,
      );
      const dropZone = screen.getByText(
        'Drop a .geojson or .json file here',
      ).parentElement!;

      const file = makeFile(validPointGeoJson(), 'dropped.geojson');
      const dropEvent = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [file] },
      });

      dropZone.dispatchEvent(dropEvent);

      await waitFor(() => {
        expect(onAdd).toHaveBeenCalledTimes(1);
      });
      expect(onAdd.mock.calls[0]![0].fileName).toBe('dropped.geojson');
    });

    it('prevents default on dragover to enable drop', () => {
      render(
        <GeoJsonOverlayPanel
          overlays={[]}
          onAdd={onAdd}
          onToggleVisibility={onToggleVisibility}
          onRemove={onRemove}
        />,
      );
      const dropZone = screen.getByText(
        'Drop a .geojson or .json file here',
      ).parentElement!;

      const dragOverEvent = new Event('dragover', { bubbles: true });
      const preventDefault = vi.spyOn(dragOverEvent, 'preventDefault');
      dropZone.dispatchEvent(dragOverEvent);
      expect(preventDefault).toHaveBeenCalled();
    });
  });
});
