import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CategoryCard } from '@/screens/CategoriesEditor/CategoryCard';

const defaultProps = {
  docId: 'cat-1',
  label: 'Deforestation',
  fieldRefs: [{ docId: 'field-1', label: 'Severity' }],
};

describe('CategoryCard', () => {
  it('calls onClick with docId when clicked', () => {
    const onClick = vi.fn();
    render(<CategoryCard {...defaultProps} onClick={onClick} />);

    fireEvent.click(screen.getByTestId('category-card'));

    expect(onClick).toHaveBeenCalledWith('cat-1');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter is pressed on the card', () => {
    const onClick = vi.fn();
    render(<CategoryCard {...defaultProps} onClick={onClick} />);

    fireEvent.keyDown(screen.getByTestId('category-card'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledWith('cat-1');
  });

  it('calls onClick when Space is pressed on the card', () => {
    const onClick = vi.fn();
    render(<CategoryCard {...defaultProps} onClick={onClick} />);

    fireEvent.keyDown(screen.getByTestId('category-card'), { key: ' ' });

    expect(onClick).toHaveBeenCalledWith('cat-1');
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

  it('renders the label as heading', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByText('Deforestation')).toBeInTheDocument();
  });

  it('renders field count using i18n plural', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByText('1 field')).toBeInTheDocument();
  });

  it('renders plural field count for multiple fieldRefs', () => {
    render(
      <CategoryCard
        {...defaultProps}
        fieldRefs={[{ docId: 'f1' }, { docId: 'f2' }, { docId: 'f3' }]}
      />,
    );

    expect(screen.getByText('3 fields')).toBeInTheDocument();
  });

  it('renders color accent bar when color is provided', () => {
    render(<CategoryCard {...defaultProps} color="#FF0000" />);

    const accent = screen.getByTestId('color-accent');
    expect(accent).toBeInTheDocument();
    expect(accent).toHaveStyle({ backgroundColor: '#FF0000' });
  });

  it('renders initial avatar with first letter uppercase', () => {
    render(<CategoryCard {...defaultProps} label="mining" />);

    expect(screen.getByText('M')).toBeInTheDocument();
  });
});
