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

  it('renders secondaryContent when provided', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
        secondaryContent={<div data-testid="secondary">Project list</div>}
      />,
    );
    expect(screen.getByTestId('secondary')).toBeInTheDocument();
  });

  it('does not render secondary section when secondaryContent not provided', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    // There should be no element with data-testid="secondary"
    expect(screen.queryByTestId('secondary')).not.toBeInTheDocument();
  });

  it('does not render ThemeToggle section after theme lock', () => {
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={() => {}}
      />,
    );
    // ThemeToggle was removed — no theme buttons should appear
    expect(screen.queryByText('Cloud')).not.toBeInTheDocument();
    expect(screen.queryByText('Mobile')).not.toBeInTheDocument();
    expect(screen.queryByText('Sentinel')).not.toBeInTheDocument();
  });
});
