import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useState } from 'react';

import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import type {
  ProjectEntry,
  ServerEntry,
} from '@/components/layout/mobile-nav-drawer';

const meta: Meta<typeof MobileNavDrawer> = {
  title: 'Layout/MobileNavDrawer',
  component: MobileNavDrawer,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MobileNavDrawer>;

const mockServers = [
  {
    id: 'server-1',
    label: 'Amazon Archive',
    baseUrl: 'https://archive.amazon.example.com',
    status: 'success' as const,
  },
  {
    id: 'server-2',
    label: 'Cerrado Archive',
    baseUrl: 'https://archive.cerrado.example.com',
    status: 'success' as const,
  },
  {
    id: 'server-3',
    label: 'Fundação Nacional do Índio — Amazonia Archive',
    baseUrl: 'https://archive.fnai.example.com',
    status: 'success' as const,
  },
];

const mockProjects = {
  'server-1': [
    { localId: 'proj-a1', name: 'River Monitoring' },
    { localId: 'proj-a2', name: 'Forest Patrol' },
  ],
  'server-2': [
    { localId: 'proj-b1', name: 'Cerrado North' },
  ],
};

const navItems = [
  { path: '/', label: 'Home', icon: <span>🏠</span> },
  { path: '/observations', label: 'Observations', icon: <span>📋</span> },
  { path: '/alerts', label: 'Alerts', icon: <span>🔔</span> },
  { path: '/data', label: 'Data', icon: <span>📊</span> },
  { path: '/settings', label: 'Settings', icon: <span>⚙️</span> },
];

function OpenDrawerDemo({
  archives,
  archiveProjects,
}: {
  archives: ServerEntry[];
  archiveProjects: Record<string, ProjectEntry[]>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <MobileNavDrawer
      open={open}
      onOpenChange={setOpen}
      navItems={navItems}
      activePath="/"
      onNavigate={() => {}}
      archives={archives}
      archiveProjects={archiveProjects}
      onAddServer={() => console.log('add server')}
      onCreateProject={() => console.log('create project')}
      onSelectServer={(id) => console.log('select server', id)}
      onSelectProject={(id) => console.log('select project', id)}
      onArchiveSettings={(id) => console.log('archive settings', id)}
    />
  );
}

export const Default: Story = {
  render: () => (
    <OpenDrawerDemo archives={mockServers} archiveProjects={mockProjects} />
  ),
};

export const WithArchives: Story = {
  render: () => (
    <OpenDrawerDemo archives={mockServers} archiveProjects={mockProjects} />
  ),
};

export const NoServers: Story = {
  render: () => <OpenDrawerDemo archives={[]} archiveProjects={{}} />,
};
