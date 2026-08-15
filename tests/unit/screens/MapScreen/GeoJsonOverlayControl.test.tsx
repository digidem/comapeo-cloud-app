import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { GeoJsonOverlay } from '@/lib/map/geojson-overlays';
import { GeoJsonOverlayControl } from '@/screens/MapScreen/GeoJsonOverlayControl';

const overlay: GeoJsonOverlay = {
  id: 'overlay-1',
  name: 'territory.geojson',
  visible: true,
  data: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: null,
        geometry: { type: 'Point', coordinates: [-60, -3] },
      },
    ],
  },
};

describe('GeoJsonOverlayControl', () => {
  it('provides a file picker and forwards selected files', async () => {
    const user = userEvent.setup();
    const onFilesSelected = vi.fn();
    render(
      <GeoJsonOverlayControl
        overlays={[]}
        onFilesSelected={onFilesSelected}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const file = new File(
      ['{"type":"Point","coordinates":[-60,-3]}'],
      'point.geojson',
      { type: 'application/geo+json' },
    );
    await user.upload(screen.getByLabelText('Add GeoJSON reference'), file);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
    expect(screen.getByText('Up to 5 MB per file')).toBeInTheDocument();
  });

  it('exposes the loading state through the file picker accessible name and busy state', () => {
    render(
      <GeoJsonOverlayControl
        overlays={[]}
        onFilesSelected={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        loading
      />,
    );

    const input = screen.getByLabelText('Adding GeoJSON…');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Adding GeoJSON…')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('uses unique labelled-by ids when multiple controls are mounted', () => {
    render(
      <>
        <GeoJsonOverlayControl
          overlays={[]}
          onFilesSelected={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
        />
        <GeoJsonOverlayControl
          overlays={[]}
          onFilesSelected={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
        />
      </>,
    );

    const labelledBy = screen
      .getAllByRole('region', { name: 'Reference data' })
      .map((section) => section.getAttribute('aria-labelledby'));
    expect(labelledBy).toHaveLength(2);
    expect(new Set(labelledBy).size).toBe(2);
  });

  it('shows each overlay by filename with visibility and remove actions', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    render(
      <GeoJsonOverlayControl
        overlays={[overlay]}
        onFilesSelected={vi.fn()}
        onToggle={onToggle}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText('territory.geojson')).toBeInTheDocument();

    const visibilityButton = screen.getByRole('button', {
      name: 'Hide territory.geojson',
    });
    expect(visibilityButton).toHaveTextContent(/^Hide$/);
    expect(visibilityButton).not.toHaveAttribute('aria-pressed');

    await user.click(visibilityButton);
    expect(onToggle).toHaveBeenCalledWith('overlay-1');

    await user.click(
      screen.getByRole('button', { name: 'Remove territory.geojson' }),
    );
    expect(onRemove).toHaveBeenCalledWith('overlay-1');
  });

  it('renders import errors as a dismissible alert', async () => {
    const user = userEvent.setup();
    const onDismissError = vi.fn();
    render(
      <GeoJsonOverlayControl
        overlays={[]}
        onFilesSelected={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        error="This file is not valid GeoJSON."
        onDismissError={onDismissError}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This file is not valid GeoJSON.',
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(onDismissError).toHaveBeenCalledOnce();
  });
});
