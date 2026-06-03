import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

import { HomeScreen } from './HomeScreen';

interface HomeScreenArgs {
  selectedProjectId: string | null;
  hasArchiveServers: boolean;
}

const SERVER_LIST = [
  {
    id: 'server-1',
    label: 'Amazon Archive',
    baseUrl: 'https://archive.amazon.example.com',
    token: 'mock-token-1',
    lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),
    status: 'connected' as const,
  },
  {
    id: 'server-2',
    label: 'Cerrado Archive',
    baseUrl: 'https://archive.cerrado.example.com',
    token: 'mock-token-2',
    lastSyncedAt: new Date(Date.now() - 7200_000).toISOString(),
    status: 'connected' as const,
  },
];

const meta: Meta<HomeScreenArgs> = {
  title: 'Screens/Home',
  component: HomeScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    selectedProjectId: 'proj-1',
    hasArchiveServers: false,
  },
  argTypes: {
    selectedProjectId: {
      name: 'Selected project',
      description:
        'Project selected in the project store. `null` renders the empty state.',
      control: 'select',
      options: [null, 'proj-1'],
      table: {
        type: { summary: 'string | null' },
        defaultValue: { summary: 'proj-1' },
      },
    },
    hasArchiveServers: {
      name: 'Archive servers',
      description: 'Whether connected archive servers are present.',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useAuthStore.setState({
        servers: context.args.hasArchiveServers ? SERVER_LIST : [],
      });
      return <Story />;
    },
  ],
  render: () => <HomeScreen />,
};

export default meta;
type Story = StoryObj<HomeScreenArgs>;

export const NoProjectSelected: Story = {
  args: { selectedProjectId: null, hasArchiveServers: false },
};

export const WithProjectSelected: Story = {
  args: { selectedProjectId: 'proj-1', hasArchiveServers: false },
};

export const WithArchiveServers: Story = {
  args: { selectedProjectId: 'proj-1', hasArchiveServers: true },
};

export const WithProjectDesktop: Story = {
  args: { selectedProjectId: 'proj-1', hasArchiveServers: false },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};

export const WithArchiveServersDesktop: Story = {
  args: { selectedProjectId: 'proj-1', hasArchiveServers: true },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};
