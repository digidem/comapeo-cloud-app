import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoJsonOverlay } from '@/screens/MapScreen/GeoJsonOverlay';

const { uuid } = vi.hoisted(() => {
  let n = 0;
  return { uuid: () => `uuid-${n++}` };
});
vi.mock('@/lib/uuid', () => ({ uuid }));

const dropGeoJson = (zone: HTMLElement, files: File[]) => {
  fireEvent.drop(zone, {
    dataTransfer: { files, items: [], types: ['Files'] },
  });
};

const makeFile = (name: string, content: string, size?: number): File => {
  const f = new File([content], name, { type: 'application/json' });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

const featureCollection = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    },
  ],
});
const feature = JSON.stringify({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [1, 1] },
  properties: {},
});
const bareGeometry = JSON.stringify({ type: 'Point', coordinates: [2, 2] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GeoJsonOverlay', () => {
  it('renders the dropzone with the correct label and no panel initially', () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    expect(screen.getByTestId('geojson-dropzone')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/drop a \.geojson/i),
    );
    expect(screen.queryByTestId('geojson-overlay-panel')).toBeNull();
  });

  it('shows the active drop hint on drag enter and hides it on drag leave', () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    const zone = screen.getByTestId('geojson-dropzone');
    fireEvent.dragEnter(zone);
    expect(
      screen.getByText(/drop the file to add the overlay/i),
    ).toBeInTheDocument();
    expect(zone.className).toContain('border-dashed');
    fireEvent.dragLeave(zone);
    expect(screen.queryByText(/drop the file to add the overlay/i)).toBeNull();
  });

  it('adds an overlay from a valid FeatureCollection file', async () => {
    const onOverlaysChange = vi.fn();
    render(<GeoJsonOverlay onOverlaysChange={onOverlaysChange} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('layer.geojson', featureCollection),
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('geojson-overlay-row')).toBeInTheDocument();
    });
    expect(onOverlaysChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'layer.geojson' }),
      ]),
    );
  });

  it('adds an overlay from a single Feature file', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('feat.geojson', feature),
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('geojson-overlay-row')).toBeInTheDocument();
    });
  });

  it('adds an overlay from a bare Geometry object', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('geom.geojson', bareGeometry),
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('geojson-overlay-row')).toBeInTheDocument();
    });
  });

  it('rejects an invalid GeoJSON object with an alert and no overlay', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('bad.geojson', JSON.stringify({ foo: 'bar' })),
    ]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not valid geojson/i);
    });
    expect(screen.queryByTestId('geojson-overlay-row')).toBeNull();
  });

  it('rejects a non-geojson filename extension', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('layer.txt', featureCollection),
    ]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not valid geojson/i);
    });
    expect(screen.queryByTestId('geojson-overlay-row')).toBeNull();
  });

  it('rejects unparseable JSON content', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('broken.geojson', 'not json'),
    ]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not valid geojson/i);
    });
    expect(screen.queryByTestId('geojson-overlay-row')).toBeNull();
  });

  it('warns when a large file is dropped', async () => {
    const big = makeFile('big.geojson', featureCollection, 6 * 1024 * 1024);
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [big]);
    await waitFor(() => {
      expect(screen.getByText(/large files may slow/i)).toBeInTheDocument();
    });
  });

  it('toggles an overlay visibility', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('layer.geojson', featureCollection),
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('geojson-overlay-row')).toBeInTheDocument();
    });
    const toggle = screen.getByLabelText(/toggle overlay visibility/i);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/toggle overlay visibility/i)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('removes an overlay', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    dropGeoJson(screen.getByTestId('geojson-dropzone'), [
      makeFile('layer.geojson', featureCollection),
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('geojson-overlay-row')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(/remove overlay/i));
    expect(screen.queryByTestId('geojson-overlay-row')).toBeNull();
  });

  it('clears all overlays', async () => {
    render(<GeoJsonOverlay onOverlaysChange={vi.fn()} />);
    const zone = screen.getByTestId('geojson-dropzone');
    dropGeoJson(zone, [makeFile('a.geojson', featureCollection)]);
    dropGeoJson(zone, [makeFile('b.geojson', feature)]);
    await waitFor(() => {
      expect(screen.getAllByTestId('geojson-overlay-row')).toHaveLength(2);
    });
    fireEvent.click(screen.getByText(/clear all overlays/i));
    await waitFor(() => {
      expect(screen.queryByTestId('geojson-overlay-panel')).toBeNull();
    });
    expect(screen.queryByTestId('geojson-overlay-row')).toBeNull();
  });
});
