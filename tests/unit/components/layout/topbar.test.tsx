import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

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
    expect(topbar.className).toContain('bg-[#04145C]');
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
});
