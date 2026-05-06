import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { ContextualSubnav } from '@/components/layout/contextual-subnav';

describe('ContextualSubnav', () => {
  it('renders with title', () => {
    render(<ContextualSubnav title="Filters">Content</ContextualSubnav>);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ContextualSubnav title="Filters">
        <div data-testid="child-content">Child content</div>
      </ContextualSubnav>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('has correct width (w-[268px])', () => {
    render(<ContextualSubnav title="Test">Content</ContextualSubnav>);
    const subnav = screen.getByRole('complementary');
    expect(subnav.className).toContain('w-[268px]');
  });
});
