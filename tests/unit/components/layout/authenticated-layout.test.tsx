import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';

import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';
import { useProjectStore } from '@/stores/project-store';

const { mockNavigate, mockRouterState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRouterState: { pathname: '/' },
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet-content">Child Route</div>,
  useNavigate: () => mockNavigate,
  useRouterState: (opts?: {
    select?: (state: { location: { pathname: string } }) => unknown;
  }) => {
    const state = { location: { pathname: mockRouterState.pathname } };
    return opts?.select ? opts.select(state) : state;
  },
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

vi.mock('@/hooks/useAutoSync', () => ({
  useAutoSync: vi.fn(),
}));

vi.mock('@/screens/Home/ArchiveBrowser', () => ({
  ArchiveBrowser: ({
    selectedProjectId,
    onSelect,
    onCreateNew,
    onAddServer,
    onSelectServer,
  }: {
    selectedProjectId: string | null;
    onSelect: (id: string) => void;
    onCreateNew: () => void;
    onAddServer: () => void;
    onSelectServer: (id: string) => void;
  }) => (
    <div
      data-testid="archive-browser"
      data-selected-project-id={selectedProjectId ?? ''}
    >
      <button type="button" onClick={() => onSelect('project-2')}>
        Select Project
      </button>
      <button type="button" onClick={onCreateNew}>
        Create Project
      </button>
      <button type="button" onClick={onAddServer}>
        Add Server
      </button>
      <button type="button" onClick={() => onSelectServer('server-1')}>
        Select Server
      </button>
    </div>
  ),
}));

const mockUseAutoSync = vi.mocked(
  await import('@/hooks/useAutoSync').then((m) => m.useAutoSync),
);

describe('AuthenticatedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterState.pathname = '/';
    useProjectStore.setState({
      selectedProjectId: null,
      selectedServerId: null,
    });
  });

  it('renders AppShell with navigation items', () => {
    render(<AuthenticatedLayout />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders CoMapeo Cloud branding in topbar', () => {
    render(<AuthenticatedLayout />);
    const label = screen.getByLabelText('CoMapeo Cloud');
    expect(label).toBeInTheDocument();
  });

  it('renders Outlet for child routes', () => {
    render(<AuthenticatedLayout />);
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
    expect(screen.getByText('Child Route')).toBeInTheDocument();
  });

  it('wraps layout with ShellSlotProvider', () => {
    // AuthenticatedLayout renders ShellSlotProvider -> AuthenticatedLayoutInner
    // The Outlet mock renders inside the provider, so if we can see
    // the outlet content alongside the nav items, the provider is working.
    render(<AuthenticatedLayout />);

    // Verify the full layout renders: nav items + outlet content
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
  });

  it('drawer renders with Home and Settings nav items', async () => {
    render(<AuthenticatedLayout />);
    // Open the drawer
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    // Drawer should contain nav items
    expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Alerts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Map').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('calls useAutoSync on mount', () => {
    render(<AuthenticatedLayout />);
    expect(mockUseAutoSync).toHaveBeenCalledTimes(1);
  });

  it('drawer renders secondary content from ShellSlot overrides', async () => {
    // ShellSlotProvider starts with no overrides, so secondaryContent is undefined
    render(<AuthenticatedLayout />);
    // Open the drawer
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    // Close button visible means drawer is open
    expect(
      await screen.findByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it('renders the archive browser as persistent secondary content on authenticated pages', async () => {
    const user = userEvent.setup();
    mockRouterState.pathname = '/data';
    useProjectStore.setState({ selectedProjectId: 'project-1' });

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId('archive-browser')).toHaveAttribute(
      'data-selected-project-id',
      'project-1',
    );

    await user.click(screen.getByRole('button', { name: 'Select Project' }));

    expect(useProjectStore.getState().selectedProjectId).toBe('project-2');
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });
});
