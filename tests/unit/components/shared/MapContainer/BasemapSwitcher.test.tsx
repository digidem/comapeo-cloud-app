import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BasemapSwitcher } from '@/components/shared/MapContainer/BasemapSwitcher';
import { BASEMAP_CATALOG } from '@/lib/map/basemaps';

// Radix uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('BasemapSwitcher', () => {
  it('renders a layer icon button', () => {
    render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={() => {}}
        basemaps={BASEMAP_CATALOG}
      />,
    );
    const trigger = screen.getByRole('button', { name: /basemap/i });
    expect(trigger).toBeInTheDocument();
  });

  it('shows all basemap options when the layer button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={() => {}}
        basemaps={BASEMAP_CATALOG}
      />,
    );

    await user.click(screen.getByRole('button', { name: /basemap/i }));

    for (const basemap of BASEMAP_CATALOG) {
      expect(screen.getByText(basemap.name)).toBeInTheDocument();
    }
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected basemap id', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={handleChange}
        basemaps={BASEMAP_CATALOG}
      />,
    );

    await user.click(screen.getByRole('button', { name: /basemap/i }));
    await user.click(screen.getByText('OpenStreetMap'));

    expect(handleChange).toHaveBeenCalledWith('osm-standard');
  });

  it('renders nothing with an empty catalog', () => {
    const { container } = render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={() => {}}
        basemaps={[]}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('applies custom className to the wrapper', () => {
    render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={() => {}}
        basemaps={BASEMAP_CATALOG}
        className="custom-class"
      />,
    );
    const switcher = screen.getByTestId('basemap-switcher');
    expect(switcher.classList.contains('custom-class')).toBe(true);
  });

  it('highlights the currently selected basemap', async () => {
    const user = userEvent.setup();
    render(
      <BasemapSwitcher
        value="osm-standard"
        onChange={() => {}}
        basemaps={BASEMAP_CATALOG}
      />,
    );

    await user.click(screen.getByRole('button', { name: /basemap/i }));

    const selectedItem = screen.getByRole('button', { name: 'OpenStreetMap' });
    expect(selectedItem).not.toHaveAttribute('role', 'menuitemradio');
    expect(selectedItem).not.toHaveAttribute('aria-checked');
    expect(selectedItem).toHaveClass('bg-primary/10');
  });

  it('closes the popover after selecting a basemap', async () => {
    const user = userEvent.setup();
    render(
      <BasemapSwitcher
        value="carto-positron"
        onChange={() => {}}
        basemaps={BASEMAP_CATALOG}
      />,
    );

    await user.click(screen.getByRole('button', { name: /basemap/i }));
    expect(screen.getByText('OpenStreetMap')).toBeInTheDocument();

    await user.click(screen.getByText('OpenStreetMap'));

    expect(screen.queryByText('CartoDB Positron')).not.toBeInTheDocument();
  });
});
