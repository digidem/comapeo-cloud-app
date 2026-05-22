import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Topbar } from '@/components/layout/topbar';

describe('Topbar', () => {
  it('renders CoMapeo Cloud text with styled segments', () => {
    render(<Topbar />);
    // The branding text is split across two styled spans with aria-label
    expect(screen.getByLabelText('CoMapeo Cloud')).toBeInTheDocument();
    expect(screen.getByText('Co')).toBeInTheDocument();
    expect(screen.getByText('Mapeo Cloud')).toBeInTheDocument();
  });

  it('renders children (action buttons)', () => {
    render(
      <Topbar>
        <button>Action</button>
      </Topbar>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('has correct height class (h-14 = 56px)', () => {
    render(<Topbar />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('h-14');
  });

  it('has surface-card background', () => {
    render(<Topbar />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('bg-surface-card');
  });

  it('renders workspace name as h1 heading with semantic classes', () => {
    render(<Topbar workspaceName="My Workspace" />);
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'My Workspace',
    });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H1');
    expect(heading.className).toContain('truncate');
    expect(heading.className).toContain('font-semibold');
    expect(heading).toHaveAttribute('title', 'My Workspace');
  });

  it('renders mode label pill when modeLabel provided', () => {
    render(<Topbar modeLabel="Beta" />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders brand fallback as h1 heading when workspaceName not provided', () => {
    render(<Topbar />);
    // Brand fallback should be visible and serve as the page's h1 for a11y
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'CoMapeo Cloud',
    });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H1');
  });

  it('renders topbarActions via children prop', () => {
    render(
      <Topbar>
        <button data-testid="action-btn">Sync</button>
      </Topbar>,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });

  it('renders hamburger button when onMenuClick prop provided', () => {
    render(<Topbar onMenuClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it('hamburger button calls onMenuClick when clicked', async () => {
    const onMenuClick = vi.fn();
    render(<Topbar onMenuClick={onMenuClick} />);
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it('hamburger button has lg:hidden class', () => {
    render(<Topbar onMenuClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /open menu/i });
    expect(btn.className).toContain('lg:hidden');
  });

  it('does not render logo image', () => {
    render(<Topbar />);
    const images = screen.queryAllByRole('img');
    expect(images).toHaveLength(0);
  });

  it('renders CoMapeo Cloud branding text', () => {
    render(<Topbar />);
    expect(screen.getByText('Co')).toBeInTheDocument();
    expect(screen.getByText('Mapeo Cloud')).toBeInTheDocument();
  });

  it('workspace heading has responsive max-width classes', () => {
    render(<Topbar workspaceName="My Workspace" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('max-w-[40vw]');
    expect(heading.className).toContain('sm:max-w-[280px]');
    expect(heading.className).toContain('lg:max-w-[420px]');
  });

  it('mode label has hidden md:inline-flex class', () => {
    render(<Topbar modeLabel="Beta" />);
    const label = screen.getByText('Beta');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('md:inline-flex');
  });

  describe('animated hamburger button', () => {
    it('renders 3 span bars when isMenuOpen is false', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      const btn = screen.getByRole('button', { name: /open menu/i });
      // The 3 bars are inside the aria-hidden wrapper
      const wrapper = btn.querySelector('[aria-hidden="true"]');
      const bars = wrapper!.querySelectorAll('span');
      expect(bars).toHaveLength(3);
    });

    it('transforms bars when isMenuOpen is true', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={true} />);
      const btn = screen.getByRole('button', { name: /close menu/i });
      const wrapper = btn.querySelector('[aria-hidden="true"]');
      const bars = wrapper!.querySelectorAll('span');
      // Top bar rotates 45deg
      expect(bars[0]!.className).toContain('rotate-45');
      // Middle bar hides
      expect(bars[1]!.className).toContain('opacity-0');
      // Bottom bar rotates -45deg
      expect(bars[2]!.className).toContain('-rotate-45');
    });

    it('has aria-label "Open menu" when closed', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      expect(
        screen.getByRole('button', { name: 'Open menu' }),
      ).toBeInTheDocument();
    });

    it('has aria-label "Close menu" when open', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={true} />);
      expect(
        screen.getByRole('button', { name: 'Close menu' }),
      ).toBeInTheDocument();
    });

    it('has aria-expanded false when closed', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      const btn = screen.getByRole('button', { name: /menu/i });
      expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    it('has aria-expanded true when open', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={true} />);
      const btn = screen.getByRole('button', { name: /menu/i });
      expect(btn).toHaveAttribute('aria-expanded', 'true');
    });

    it('button has active:scale-75 class', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      const btn = screen.getByRole('button', { name: /open menu/i });
      expect(btn.className).toContain('active:scale-75');
    });

    it('button has motion-safe:transition-transform class', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      const btn = screen.getByRole('button', { name: /open menu/i });
      expect(btn.className).toContain('motion-safe:transition-transform');
    });

    it('clicking the button calls onMenuClick', async () => {
      const onMenuClick = vi.fn();
      render(<Topbar onMenuClick={onMenuClick} isMenuOpen={false} />);
      await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
      expect(onMenuClick).toHaveBeenCalledOnce();
    });

    it('button has visible focus ring (ring-primary, not ring-white)', () => {
      render(<Topbar onMenuClick={() => {}} isMenuOpen={false} />);
      const btn = screen.getByRole('button', { name: /open menu/i });
      expect(btn.className).toContain('focus-visible:ring-primary');
      expect(btn.className).not.toContain('focus-visible:ring-white');
    });
  });
});
