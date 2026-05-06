import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { PrimaryNav } from '@/components/layout/primary-nav';

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/projects', label: 'Projects' },
  { path: '/settings', label: 'Settings' },
];

describe('PrimaryNav', () => {
  it('renders navigation items with labels', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('active item has highlighted style', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const dashboardItem = screen.getByText('Dashboard').closest('a');
    expect(dashboardItem?.className).toContain('text-primary');
  });

  it('has correct width on desktop (w-[76px])', () => {
    render(<PrimaryNav items={navItems} activePath="/dashboard" />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('w-[76px]');
  });
});
