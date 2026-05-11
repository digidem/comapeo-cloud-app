import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Topbar } from '@/components/layout/topbar';

describe('Topbar', () => {
  it('renders with title', () => {
    render(<Topbar title="CoMapeo Cloud" />);
    expect(screen.getByText('CoMapeo Cloud')).toBeInTheDocument();
  });

  it('renders children (action buttons)', () => {
    render(
      <Topbar title="Test">
        <button>Action</button>
      </Topbar>,
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('has correct height class (h-14 = 56px)', () => {
    render(<Topbar title="Test" />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('h-14');
  });

  it('has navy background', () => {
    render(<Topbar title="Test" />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('bg-primary-navy');
  });

  it('renders workspace badge when workspaceName provided', () => {
    render(<Topbar title="Test" workspaceName="My Workspace" />);
    expect(screen.getByText('My Workspace')).toBeInTheDocument();
    const badge = screen.getByText('My Workspace');
    expect(badge.className).toContain('rounded-full');
  });

  it('renders mode label pill when modeLabel provided', () => {
    render(<Topbar title="Test" modeLabel="Beta" />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('does not render workspace badge when workspaceName not provided', () => {
    render(<Topbar title="Test" />);
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument();
  });

  it('renders topbarActions via children prop', () => {
    render(
      <Topbar title="Test">
        <button data-testid="action-btn">Sync</button>
      </Topbar>,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });

  it('renders hamburger button when onMenuClick prop provided', () => {
    render(<Topbar title="Test" onMenuClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it('hamburger button calls onMenuClick when clicked', async () => {
    const onMenuClick = vi.fn();
    render(<Topbar title="Test" onMenuClick={onMenuClick} />);
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it('hamburger button has lg:hidden class', () => {
    render(<Topbar title="Test" onMenuClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /open menu/i });
    expect(btn.className).toContain('lg:hidden');
  });

  it('title has truncate classes', () => {
    render(<Topbar title="Test" />);
    const title = screen.getByText('Test');
    expect(title.className).toContain('truncate');
  });

  it('workspace badge has hidden sm:inline-flex class', () => {
    render(<Topbar title="Test" workspaceName="My Workspace" />);
    const badge = screen.getByText('My Workspace');
    expect(badge.className).toContain('hidden');
    expect(badge.className).toContain('sm:inline-flex');
  });

  it('mode label has hidden md:inline-flex class', () => {
    render(<Topbar title="Test" modeLabel="Beta" />);
    const label = screen.getByText('Beta');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('md:inline-flex');
  });
});
