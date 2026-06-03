import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';

const meta: Meta<typeof MapContainer> = {
  title: 'Components/MapContainer',
  component: MapContainer,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MapContainer>;

export const Default: Story = {
  args: {
    initialViewState: {
      longitude: -60,
      latitude: -3,
      zoom: 4,
    },
  },
};

export const WithoutSwitcher: Story = {
  args: {
    initialViewState: {
      longitude: -60,
      latitude: -3,
      zoom: 4,
    },
    showBasemapSwitcher: false,
  },
};

export const NonInteractive: Story = {
  args: {
    initialViewState: {
      longitude: -60,
      latitude: -3,
      zoom: 4,
    },
    interactive: false,
  },
};
