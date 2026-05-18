import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Topbar } from '@/components/layout/topbar';

describe('Topbar', () => {
  it('renders with logo image', () => {
    render(<Topbar />);
    const logo = screen.getByRole('img', { name: 'CoMapeo Cloud' });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/comapeo_cloud_logo_min.png');
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

  it('has white background', () => {
    render(<Topbar />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('bg-white');
  });

  it('renders workspace badge when workspaceName provided', () => {
    render(<Topbar workspaceName="My Workspace" />);
    expect(screen.getByText('My Workspace')).toBeInTheDocument();
    const badge = screen.getByText('My Workspace');
    expect(badge.className).toContain('rounded-full');
  });

  it('renders mode label pill when modeLabel provided', () => {
    render(<Topbar modeLabel="Beta" />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('does not render workspace badge when workspaceName not provided', () => {
    render(<Topbar />);
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument();
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

  it('logo has correct height class', () => {
    render(<Topbar />);
    const logo = screen.getByRole('img', { name: 'CoMapeo Cloud' });
    expect(logo.className).toContain('h-12');
  });

  it('workspace badge has hidden sm:inline-flex class', () => {
    render(<Topbar workspaceName="My Workspace" />);
    const badge = screen.getByText('My Workspace');
    expect(badge.className).toContain('hidden');
    expect(badge.className).toContain('sm:inline-flex');
  });

  it('mode label has hidden md:inline-flex class', () => {
    render(<Topbar modeLabel="Beta" />);
    const label = screen.getByText('Beta');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('md:inline-flex');
  });
});
