import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { BasemapSwitcher } from '@/components/shared/MapContainer/BasemapSwitcher';
import { BASEMAP_CATALOG } from '@/lib/map/basemaps';

const meta: Meta<typeof BasemapSwitcher> = {
  title: 'Components/BasemapSwitcher',
  component: BasemapSwitcher,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof BasemapSwitcher>;

const noop = () => {};

export const Default: Story = {
  args: {
    value: 'carto-positron',
    basemaps: BASEMAP_CATALOG,
    onChange: noop,
  },
};

export const SatelliteSelected: Story = {
  args: {
    value: 'esri-world-imagery',
    basemaps: BASEMAP_CATALOG,
    onChange: noop,
  },
};
