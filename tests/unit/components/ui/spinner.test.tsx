import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { Spinner } from '@/components/ui/spinner';

describe('Spinner', () => {
  it('renders an SVG with role="img" and accessible label', () => {
    render(<Spinner />);
    const svg = screen.getByRole('img', { name: /loading/i });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName).toBe('svg');
  });

  it('has width and height of 24px by default', () => {
    render(<Spinner />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('respects custom size prop', () => {
    render(<Spinner size={32} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('respects custom className prop', () => {
    render(<Spinner className="my-spinner" />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('class', expect.stringContaining('my-spinner'));
  });

  it('applies the primary-blue fill color', () => {
    render(<Spinner />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveClass('text-primary');
  });

  it('uses prefers-reduced-motion to disable animation', () => {
    render(<Spinner />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveClass('motion-safe:animate-spin');
  });
});
