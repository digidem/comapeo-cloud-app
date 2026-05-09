import { render, screen } from '@tests/mocks/test-utils';
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
});
