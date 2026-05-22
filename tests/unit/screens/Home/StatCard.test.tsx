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

  it('renders subtitle when provided', () => {
    render(
      <StatCard
        title="Field Data"
        value={10}
        subtitle={<span data-testid="subtitle-photos">3 photos</span>}
      />,
    );
    expect(screen.getByTestId('subtitle-photos')).toBeInTheDocument();
  });

  it('does not render subtitle when isLoading', () => {
    render(
      <StatCard
        title="Field Data"
        value={10}
        isLoading
        subtitle={<span data-testid="subtitle-photos">3 photos</span>}
      />,
    );
    expect(screen.queryByTestId('subtitle-photos')).not.toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<StatCard title="Observations" value={42} />);
    // No subtitle container should exist
    const subtitleContainers = document.querySelectorAll('.mt-2.text-sm');
    expect(subtitleContainers.length).toBe(0);
  });

  describe('responsive classes (issue #15)', () => {
    it('has responsive padding classes on the card', () => {
      render(<StatCard title="Observations" value={42} />);
      const card = document.querySelector('.flex.flex-col');
      expect(card).not.toBeNull();
      // Should have p-4 for mobile, sm:p-5 for tablet/desktop
      expect(card!.className).toContain('p-4');
      expect(card!.className).toContain('sm:p-5');
    });

    it('has responsive font size classes on the value', () => {
      render(<StatCard title="Observations" value={42} />);
      // The value div should have text-lg (mobile), sm:text-2xl (tablet),
      // lg:text-4xl (desktop)
      const valueDiv = document.querySelector('.font-bold.tracking-tight');
      expect(valueDiv).not.toBeNull();
      expect(valueDiv!.className).toContain('text-lg');
      expect(valueDiv!.className).toContain('sm:text-2xl');
      expect(valueDiv!.className).toContain('lg:text-4xl');
      // Should NOT have the old static text-4xl class
      const classList = valueDiv!.className.split(/\s+/);
      const textClasses = classList.filter((c) => c.startsWith('text-'));
      expect(textClasses).not.toContain('text-4xl');
    });

    it('preserves valueColor alongside responsive font classes', () => {
      render(<StatCard title="Alerts" value={5} valueColor="text-success" />);
      const valueDiv = document.querySelector('.font-bold.tracking-tight');
      expect(valueDiv).not.toBeNull();
      expect(valueDiv!.className).toContain('text-success');
      expect(valueDiv!.className).toContain('text-lg');
      expect(valueDiv!.className).toContain('sm:text-2xl');
      expect(valueDiv!.className).toContain('lg:text-4xl');
    });

    it('skeleton still renders correctly with responsive classes', () => {
      render(<StatCard title="Observations" value={42} isLoading />);
      // Skeleton should still be present
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
      // Value div should have responsive classes even when showing skeleton
      const valueDiv = document.querySelector('.font-bold.tracking-tight');
      expect(valueDiv).not.toBeNull();
      expect(valueDiv!.className).toContain('text-lg');
      expect(valueDiv!.className).toContain('sm:text-2xl');
      expect(valueDiv!.className).toContain('lg:text-4xl');
    });
  });
});
