import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

import { HomeScreen } from './HomeScreen';

const meta = {
  title: 'Screens/Home',
  component: HomeScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

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

export const WithArchiveServersDesktop: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  decorators: [
    (Story) => {
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
