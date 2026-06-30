import { fireEvent, render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { BASEMAP_CATALOG } from '@/lib/map/basemaps';
import { StylePicker } from '@/screens/MapScreen/StylePicker';

describe('StylePicker', () => {
  it('exposes selected mode and preset state with aria-pressed', async () => {
    const user = userEvent.setup();

    render(<StylePicker value={BASEMAP_CATALOG[0]!} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Presets' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Custom URL' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'CartoDB Positron' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Custom URL' }));

    expect(screen.getByRole('button', { name: 'Presets' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Custom URL' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('selects a preset basemap from the catalog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StylePicker value={BASEMAP_CATALOG[0]!} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'OpenStreetMap' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'osm-standard',
        name: 'OpenStreetMap',
        type: 'raster',
      }),
    );
  });

  it('rejects custom URLs that are not http or https', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StylePicker value={BASEMAP_CATALOG[0]!} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Custom URL' }));
    await user.type(screen.getByLabelText('Custom URL'), 'ftp://example.com/a');
    await user.click(screen.getByRole('button', { name: 'Use custom URL' }));

    expect(
      screen.getByText('Enter an http:// or https:// URL'),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the raster scheme control only for raster custom URLs', async () => {
    const user = userEvent.setup();

    render(<StylePicker value={BASEMAP_CATALOG[0]!} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Custom URL' }));
    expect(screen.queryByLabelText('Tile scheme')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Map type'), 'raster');
    expect(screen.getByLabelText('Tile scheme')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Map type'), 'style');
    expect(screen.queryByLabelText('Tile scheme')).not.toBeInTheDocument();
  });

  it('applies a valid custom raster tile URL with a TMS scheme', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StylePicker value={BASEMAP_CATALOG[0]!} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Custom URL' }));
    fireEvent.change(screen.getByLabelText('Custom URL'), {
      target: { value: 'https://tiles.example.com/{z}/{x}/{y}.png' },
    });
    await user.selectOptions(screen.getByLabelText('Map type'), 'raster');
    await user.selectOptions(screen.getByLabelText('Tile scheme'), 'tms');
    await user.click(screen.getByRole('button', { name: 'Use custom URL' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom',
        name: 'Custom URL',
        type: 'raster',
        url: 'https://tiles.example.com/{z}/{x}/{y}.png',
        scheme: 'tms',
      }),
    );
  });
});
