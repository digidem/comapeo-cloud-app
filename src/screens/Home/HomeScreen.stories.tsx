import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';

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

export const WithArchiveServers: Story = {
  decorators: [
    (Story) => {
      // Ensure auth store has the mock servers (it already does by default,
      // but this makes the intent explicit and allows overriding per-story)
      useAuthStore.setState({
        servers: [
          {
            id: 'server-1',
            label: 'Amazon Archive',
            baseUrl: 'https://archive.amazon.example.com',
            token: 'mock-token-1',
            lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),
            status: 'connected',
          },
          {
            id: 'server-2',
            label: 'Cerrado Archive',
            baseUrl: 'https://archive.cerrado.example.com',
            token: 'mock-token-2',
            lastSyncedAt: new Date(Date.now() - 7200_000).toISOString(),
            status: 'connected',
          },
        ],
      });
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
};
