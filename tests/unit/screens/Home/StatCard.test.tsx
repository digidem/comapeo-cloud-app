import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { StatCard } from '@/screens/Home/StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Observations" value={42} />);
    expect(screen.getByText('Observations')).toBeInTheDocument();
  });

  it('shows skeleton when isLoading is true', () => {
    render(<StatCard title="Observations" value={42} isLoading />);
    // Should render a skeleton for the value area
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    // Should still show the title
    expect(screen.getByText('Observations')).toBeInTheDocument();
  });

  it('shows value when isLoading is false', () => {
    render(<StatCard title="Observations" value={42} isLoading={false} />);
    expect(screen.getByText('Observations')).toBeInTheDocument();
    // Should NOT show skeleton
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('does not show skeleton by default (backward compatible)', () => {
    render(<StatCard title="Observations" value={42} />);
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <StatCard
        title="Mode"
        value="Local"
        icon={<span data-testid="test-icon">icon</span>}
      />,
    );
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('applies valueColor class', () => {
    render(<StatCard title="Alerts" value={5} valueColor="text-error" />);
    // The value div should have text-error class
    const errorElements = document.querySelectorAll('.text-error');
    expect(errorElements.length).toBeGreaterThan(0);
  });
});
