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

  it('has border-bottom', () => {
    render(<Topbar title="Test" />);
    const topbar = screen.getByRole('banner');
    expect(topbar.className).toContain('border-b');
  });
});
