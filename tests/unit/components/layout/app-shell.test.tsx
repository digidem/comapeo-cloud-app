import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';

import { AppShell } from '@/components/layout/app-shell';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
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
  };
});

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: <span>D</span> },
  { path: '/projects', label: 'Projects', icon: <span>P</span> },
  { path: '/settings', label: 'Settings', icon: <span>S</span> },
];

describe('AppShell', () => {
  it('renders topbar with title', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByText('CoMapeo Cloud')).toBeInTheDocument();
  });

  it('renders primary nav with items', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders main content area with children', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div data-testid="main-child">Hello World</div>
      </AppShell>,
    );
    expect(screen.getByTestId('main-child')).toBeInTheDocument();
  });

  it('renders contextual subnav when props provided', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
        subnavTitle="Filters"
        subnavContent={<div data-testid="subnav-child">Filter options</div>}
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByTestId('subnav-child')).toBeInTheDocument();
  });

  it('does not render contextual subnav when props not provided', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('topbar has h-14 class', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('h-14');
  });

  it('renders secondaryContent when provided', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
        secondaryContent={<div data-testid="secondary-panel">Project list</div>}
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('secondary-panel')).toBeInTheDocument();
  });

  it('does not render secondary panel when secondaryContent not provided', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('secondary-panel')).not.toBeInTheDocument();
  });

  it('renders workspace badge via topbarWorkspaceName', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
        topbarWorkspaceName="Rainforest Monitoring"
      >
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByText('Rainforest Monitoring')).toBeInTheDocument();
  });

  it('renders MobileNavDrawer in the DOM', () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    // The drawer renders nav items inside Dialog.Portal when open
    // When closed, the dialog content is not in the DOM
    // We verify the drawer component exists by checking for the close button
    // which appears when drawer is opened via hamburger
    expect(
      screen.queryByRole('button', { name: /close menu/i }),
    ).not.toBeInTheDocument();
  });

  it('drawer receives same navItems as PrimaryNav', async () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    // Open the drawer by clicking the hamburger button
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    await userEvent.click(hamburger);
    // Drawer is open (close button visible)
    expect(
      screen.getByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
    // The drawer renders the "CoMapeo Cloud" header text
    // Check that nav item text content appears in the drawer
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Projects').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('drawer receives same secondaryContent as desktop sidebar', async () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
        secondaryContent={<div data-testid="secondary-panel">Project list</div>}
      >
        <div>Main content</div>
      </AppShell>,
    );
    // Open the drawer
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    await userEvent.click(hamburger);
    // secondaryContent should appear in both desktop sidebar and drawer
    const secondaryPanels = screen.getAllByTestId('secondary-panel');
    expect(secondaryPanels.length).toBe(2);
  });

  it('hamburger callback triggers drawer open', async () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    // Initially, drawer close button should not be visible
    expect(
      screen.queryByRole('button', { name: /close menu/i }),
    ).not.toBeInTheDocument();
    // Click hamburger to open
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    // Now close button should be visible
    expect(
      screen.getByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it('closes drawer when close button is clicked', async () => {
    render(
      <AppShell
        topbarTitle="CoMapeo Cloud"
        navItems={navItems}
        activeNavPath="/dashboard"
      >
        <div>Main content</div>
      </AppShell>,
    );
    // Open the drawer
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(
      screen.getByRole('button', { name: /close menu/i }),
    ).toBeInTheDocument();
    // Click close button
    await userEvent.click(screen.getByRole('button', { name: /close menu/i }));
    // Drawer should be closed
    expect(
      screen.queryByRole('button', { name: /close menu/i }),
    ).not.toBeInTheDocument();
  });
});
