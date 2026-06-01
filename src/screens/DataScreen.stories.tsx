import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { DataScreen } from './DataScreen';

const meta: Meta<typeof DataScreen> = {
  title: 'Screens/Data',
  component: DataScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof DataScreen>;

export const NoProjectSelected: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};

export const WithProjectAndData: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
};

export const Loading: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};

export const WithProjectDesktop: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
};

export const NoProjectDesktop: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};
