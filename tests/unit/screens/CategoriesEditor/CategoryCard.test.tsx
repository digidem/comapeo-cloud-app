import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CategoryCard } from '@/screens/CategoriesEditor/CategoryCard';

vi.mock('@/screens/CategoriesEditor/CategoryIcon', () => ({
  CategoryIcon: ({
    iconRef,
    color,
    size,
    iconSize,
  }: Record<string, unknown>) => (
    <div
      data-testid="category-icon"
      data-icon-ref={iconRef ? 'present' : 'absent'}
      data-color={color as string}
      data-size={String(size)}
      data-icon-size={String(iconSize)}
    />
  ),
}));

const defaultProps = {
  docId: 'cat-1',
  label: 'Deforestation',
};

describe('CategoryCard', () => {
  it('calls onClick with docId when clicked', () => {
    const onClick = vi.fn();
    render(<CategoryCard {...defaultProps} onClick={onClick} />);

    fireEvent.click(screen.getByTestId('category-card'));

    expect(onClick).toHaveBeenCalledWith('cat-1');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets aria-pressed to true when selected', () => {
    render(<CategoryCard {...defaultProps} selected />);

    expect(screen.getByTestId('category-card')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sets aria-pressed to false when not selected', () => {
    render(<CategoryCard {...defaultProps} selected={false} />);

    expect(screen.getByTestId('category-card')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('renders the label as text', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByText('Deforestation')).toBeInTheDocument();
  });

  it('renders CategoryIcon with size=50 and iconSize=35', () => {
    render(
      <CategoryCard
        {...defaultProps}
        iconRef={{ docId: 'icon-1' }}
        projectRemoteId="proj-123"
      />,
    );

    const icon = screen.getByTestId('category-icon');
    expect(icon.getAttribute('data-size')).toBe('50');
    expect(icon.getAttribute('data-icon-size')).toBe('35');
  });

  it('renders CategoryIcon even when iconRef is undefined (letter fallback)', () => {
    render(<CategoryCard {...defaultProps} label="mining" />);

    const icon = screen.getByTestId('category-icon');
    expect(icon).toBeInTheDocument();
    expect(icon.getAttribute('data-icon-ref')).toBe('absent');
  });

  it('renders as a button element (semantic)', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByTestId('category-card').tagName).toBe('BUTTON');
  });

  it('does not render color accent strip', () => {
    render(<CategoryCard {...defaultProps} color="#FF0000" />);

    expect(screen.queryByTestId('color-accent')).not.toBeInTheDocument();
  });

  it('does not render field count badge', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.queryByText(/fields/)).not.toBeInTheDocument();
  });

  it('has min-height class for touch target', () => {
    render(<CategoryCard {...defaultProps} />);

    const card = screen.getByTestId('category-card');
    expect(card.className).toContain('min-h-[120px]');
  });
});
