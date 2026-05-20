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

  it('calls onNavigate when secondaryContent is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <MobileNavDrawer
        open={true}
        onOpenChange={() => {}}
        navItems={navItems}
        activePath="/"
        onNavigate={onNavigate}
        secondaryContent={<button type="button">Project item</button>}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Project item' }));

    expect(onNavigate).toHaveBeenCalledOnce();
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

  describe('animation enhancements', () => {
    it('overlay has backdrop-blur-sm class', () => {
      render(
        <MobileNavDrawer
          open={true}
          onOpenChange={() => {}}
          navItems={navItems}
          activePath="/"
          onNavigate={() => {}}
        />,
      );
      // Radix Dialog.Overlay renders as a div with data-state attribute
      const overlays = document.querySelectorAll('div[data-state]');
      const overlay = Array.from(overlays).find((el) =>
        el.className.includes('backdrop-blur'),
      );
      expect(overlay).toBeTruthy();
      expect(overlay?.className).toContain('backdrop-blur-sm');
    });

    it('drawer content has duration-300 class', () => {
      render(
        <MobileNavDrawer
          open={true}
          onOpenChange={() => {}}
          navItems={navItems}
          activePath="/"
          onNavigate={() => {}}
        />,
      );
      const content = document.querySelector('[role="dialog"]');
      expect(content?.className).toContain('duration-300');
    });

    it('nav items have staggered animationDelay inline styles', () => {
      render(
        <MobileNavDrawer
          open={true}
          onOpenChange={() => {}}
          navItems={navItems}
          activePath="/"
          onNavigate={() => {}}
        />,
      );
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveStyle({ animationDelay: '0ms' });
      expect(links[1]).toHaveStyle({ animationDelay: '30ms' });
    });

    it('active nav item has border-l-4 border-primary accent', () => {
      render(
        <MobileNavDrawer
          open={true}
          onOpenChange={() => {}}
          navItems={navItems}
          activePath="/"
          onNavigate={() => {}}
        />,
      );
      // Find the active link by text content (icon text makes role-based query unreliable)
      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toBeTruthy();
      expect(homeLink!.className).toContain('border-l-4');
      expect(homeLink!.className).toContain('border-primary');
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

    it('nav items have motion-safe animate class', () => {
      render(
        <MobileNavDrawer
          open={true}
          onOpenChange={() => {}}
          navItems={navItems}
          activePath="/"
          onNavigate={() => {}}
        />,
      );
      const links = screen.getAllByRole('link');
      expect(links[0]!.className).toContain('motion-safe:animate-');
    });
  });
});
