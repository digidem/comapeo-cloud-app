import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { CreateAlertScreen } from './CreateAlertScreen';

const meta: Meta<typeof CreateAlertScreen> = {
  title: 'Screens/CreateAlert',
  component: CreateAlertScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof CreateAlertScreen>;

export const WithProject: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
};

export const NoProject: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};
