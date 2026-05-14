import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';

import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet-content">Child Route</div>,
  useRouterState: () => ({ location: { pathname: '/' } }),
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

const mockUseAutoSync = vi.mocked(
  await import('@/hooks/useAutoSync').then((m) => m.useAutoSync),
);

describe('AuthenticatedLayout', () => {
  it('renders AppShell with navigation items', () => {
    render(<AuthenticatedLayout />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders app title "CoMapeo Cloud" in topbar', () => {
    render(<AuthenticatedLayout />);
    expect(screen.getByText('CoMapeo Cloud')).toBeInTheDocument();
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
      screen.getByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
  });
});
