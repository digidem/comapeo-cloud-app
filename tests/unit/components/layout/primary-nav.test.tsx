import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';

import { PrimaryNav } from '@/components/layout/primary-nav';

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
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: <span data-testid="icon-dashboard">D</span>,
  },
  {
    path: '/projects',
    label: 'Projects',
    icon: <span data-testid="icon-projects">P</span>,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <span data-testid="icon-settings">S</span>,
  },
];

describe('PrimaryNav', () => {
  it('renders icon-only buttons with aria-label for accessibility', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders icons', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('icon-projects')).toBeInTheDocument();
  });

  it('does not show visible text labels', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const textEl = screen.queryByText('Dashboard', { selector: 'span' });
    expect(textEl).not.toBeInTheDocument();
  });

  it('active item has EAF2FF background class', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink.className).toContain('bg-[#EAF2FF]');
  });

  it('active item has blue left border indicator', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink.className).toContain('border-l-4');
    expect(dashboardLink.className).toContain('border-[#1F6FFF]');
  });

  it('inactive items do not have active background', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const projectsLink = screen.getByRole('link', { name: 'Projects' });
    expect(projectsLink.className).not.toContain('bg-[#EAF2FF]');
  });

  it('nav items are 54x54px', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink.className).toContain('w-[54px]');
    expect(dashboardLink.className).toContain('h-[54px]');
  });

  it('has correct width on desktop', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('w-[76px]');
  });
});
