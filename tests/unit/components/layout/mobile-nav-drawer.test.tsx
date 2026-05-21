import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';

import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}));

const navItems = [
  { path: '/', label: 'Home', icon: <span data-testid="icon-home">H</span> },
  {
    path: '/settings',
    label: 'Settings',
    icon: <span data-testid="icon-settings">S</span>,
  },
];

describe('MobileNavDrawer', () => {
  it('renders logo and branding when open', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    const logo = document.querySelector('img');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/comapeo_cloud_app.svg');
    expect(screen.getByLabelText('CoMapeo Cloud')).toBeInTheDocument();
  });

  it('renders nav items with correct labels when open', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render nav items when closed', () => {
    render(
      <MobileNavDrawer
        open={false}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('calls onNavigate callback when a nav item is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(screen.getByText('Settings'));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange(false) when close button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={onOpenChange}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    const closeButton = screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders archives with nested projects when provided', () => {
    const archives = [
      { id: 'srv-1', label: 'My Archive', baseUrl: 'https://example.com' },
    ];
    const archiveProjects = {
      'srv-1': [
        { localId: 'p1', name: 'Alpha Project' },
        { localId: 'p2', name: 'Beta Project' },
      ],
    };
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={archiveProjects}
        onAddServer={() => {}}
      />,
    );
    expect(screen.getByText('My Archive')).toBeInTheDocument();
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add Server/i }),
    ).toBeInTheDocument();
  });

  it('renders local projects section when provided', () => {
    const localProjects = [{ localId: 'p1', name: 'Local Proj' }];
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={[{ id: 'srv-1', label: 'Remote', baseUrl: 'https://x.com' }]}
        archiveProjects={{ 'srv-1': [] }}
        localProjects={localProjects}
        onCreateProject={() => {}}
      />,
    );
    expect(screen.getByText('Local Proj')).toBeInTheDocument();
  });

  it('shows empty state when no archive servers exist', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={[]}
        onAddServer={() => {}}
      />,
    );
    expect(
      screen.getByText('No remote archive servers yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add a server to sync projects, observations, and alerts.',
      ),
    ).toBeInTheDocument();
  });

  it('shows empty state inside archive when no projects exist', () => {
    const archives = [
      { id: 'srv-1', label: 'Empty Archive', baseUrl: 'https://example.com' },
    ];
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={{ 'srv-1': [] }}
      />,
    );
    expect(
      screen.getByText('No projects in this archive yet.'),
    ).toBeInTheDocument();
  });

  it('calls onAddServer when Add Server is clicked', async () => {
    const onAddServer = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        onAddServer={onAddServer}
        archives={[]}
      />,
    );
    // Click the primary CTA button (not the header link)
    const addButtons = screen.getAllByRole('button', { name: /Add Server/i });
    await userEvent.click(addButtons[addButtons.length - 1]!);
    expect(onAddServer).toHaveBeenCalledOnce();
  });

  it('calls onCreateProject when Create Project is clicked', async () => {
    const onCreateProject = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={[{ id: 'srv-1', label: 'Remote', baseUrl: 'https://x.com' }]}
        archiveProjects={{ 'srv-1': [] }}
        onCreateProject={onCreateProject}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Create Project/i }),
    );
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it('calls onSelectServer when archive label is clicked', async () => {
    const onSelectServer = vi.fn();
    const archives = [
      { id: 'srv-1', label: 'My Archive', baseUrl: 'https://example.com' },
    ];
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        onSelectServer={onSelectServer}
      />,
    );
    await userEvent.click(screen.getByText('My Archive'));
    expect(onSelectServer).toHaveBeenCalledWith('srv-1');
  });

  it('calls onSelectProject when a nested project is clicked', async () => {
    const onSelectProject = vi.fn();
    const archives = [
      { id: 'srv-1', label: 'Archive', baseUrl: 'https://x.com' },
    ];
    const archiveProjects = {
      'srv-1': [{ localId: 'p1', name: 'Alpha Project' }],
    };
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={archiveProjects}
        onSelectProject={onSelectProject}
      />,
    );
    await userEvent.click(screen.getByText('Alpha Project'));
    expect(onSelectProject).toHaveBeenCalledWith('p1');
  });

  it('calls onSelectProject when a local project is clicked', async () => {
    const onSelectProject = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={[{ id: 'srv-1', label: 'Remote', baseUrl: 'https://x.com' }]}
        archiveProjects={{ 'srv-1': [] }}
        localProjects={[{ localId: 'loc-1', name: 'Local Project' }]}
        onSelectProject={onSelectProject}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Local Proj/i }));
    expect(onSelectProject).toHaveBeenCalledWith('loc-1');
  });

  it('calls onArchiveSettings when gear icon is clicked', async () => {
    const onArchiveSettings = vi.fn();
    const archives = [
      { id: 'srv-1', label: 'Archive', baseUrl: 'https://x.com' },
    ];
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={{ 'srv-1': [] }}
        onArchiveSettings={onArchiveSettings}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Archive settings/i }),
    );
    expect(onArchiveSettings).toHaveBeenCalledWith('srv-1');
  });

  it('highlights active archive server', () => {
    const archives = [
      { id: 'srv-1', label: 'Active Archive', baseUrl: 'https://x.com' },
      { id: 'srv-2', label: 'Inactive Archive', baseUrl: 'https://y.com' },
    ];
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        activeArchiveId="srv-1"
      />,
    );
    const activeArchive = screen.getByText('Active Archive').closest('button');
    expect(activeArchive).toBeTruthy();
    // Active archive label button should have primary color text
    expect(activeArchive!.className).toContain('text-primary');
  });

  it('renders language selector in footer', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('PT')).toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
  });

  it('shows section titles for navigation and archives', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Archives')).toBeInTheDocument();
  });

  it('does not render secondaryContent section (replaced by structured sections)', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByTestId('secondary')).not.toBeInTheDocument();
  });

  it('active nav item has highlighted styling', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink).toBeTruthy();
    expect(homeLink!.className).toContain('bg-primary-soft');
    expect(homeLink!.className).toContain('text-primary');
  });

  it('drawer header still contains close button', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it('project count in archives determines toggle visibility', () => {
    const archives = [
      { id: 'srv-1', label: 'With Projects', baseUrl: 'https://x.com' },
      { id: 'srv-2', label: 'Empty Archive', baseUrl: 'https://y.com' },
    ];
    const archiveProjects = {
      'srv-1': [{ localId: 'p1', name: 'A Project' }],
      'srv-2': [],
    };
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={archiveProjects}
      />,
    );
    // The archive with projects has a toggle button (chevron)
    const toggleButtons = screen.getAllByRole('button', {
      name: /Toggle archive section/i,
    });
    expect(toggleButtons).toHaveLength(1);
  });

  it('expands and collapses archive on toggle click', async () => {
    const archives = [
      { id: 'srv-1', label: 'Collapsible', baseUrl: 'https://x.com' },
    ];
    const archiveProjects = {
      'srv-1': [{ localId: 'p1', name: 'Nested Project' }],
    };
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        archives={archives}
        archiveProjects={archiveProjects}
      />,
    );
    // Project is visible initially
    expect(screen.getByText('Nested Project')).toBeInTheDocument();

    // Collapse
    const toggle = screen.getByRole('button', {
      name: /Toggle archive section/i,
    });
    await userEvent.click(toggle);
    expect(screen.queryByText('Nested Project')).not.toBeInTheDocument();

    // Expand again
    await userEvent.click(toggle);
    expect(screen.getByText('Nested Project')).toBeInTheDocument();
  });
});
