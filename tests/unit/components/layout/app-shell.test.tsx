import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { AppShell } from '@/components/layout/app-shell';

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/projects', label: 'Projects' },
  { path: '/settings', label: 'Settings' },
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
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
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
});
