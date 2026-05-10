import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('Card.Header renders correctly', () => {
    render(<Card.Header>Header content</Card.Header>);
    expect(screen.getByText('Header content')).toBeInTheDocument();
  });

  it('Card.Body renders correctly', () => {
    render(<Card.Body>Body content</Card.Body>);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('Card.Footer renders correctly', () => {
    render(<Card.Footer>Footer content</Card.Footer>);
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('applies className to Card', () => {
    render(<Card className="extra-class">Content</Card>);
    const el = screen.getByText('Content').closest('div');
    expect(el?.className).toContain('extra-class');
  });

  it('Card has correct base classes', () => {
    render(<Card>Content</Card>);
    const el = screen.getByText('Content').closest('div');
    expect(el?.className).toContain('bg-surface-card');
    expect(el?.className).toContain('rounded-card');
    expect(el?.className).toContain('shadow-card');
    expect(el?.className).toContain('border');
  });

  it('composes Card with sub-components', () => {
    render(
      <Card>
        <Card.Header>Header</Card.Header>
        <Card.Body>Body</Card.Body>
        <Card.Footer>Footer</Card.Footer>
      </Card>,
    );
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });
});
