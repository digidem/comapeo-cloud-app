import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { HomeScreen } from './HomeScreen';

const meta: Meta<typeof HomeScreen> = {
  title: 'Screens/Home',
  component: HomeScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof HomeScreen>;

export const NoProjectSelected: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};

export const WithProjectSelected: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
};
