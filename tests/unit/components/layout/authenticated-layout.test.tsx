import { render, screen } from '@tests/mocks/test-utils';
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
});
