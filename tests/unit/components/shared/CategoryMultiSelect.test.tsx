import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { CategoryMultiSelect } from '@/components/shared/CategoryMultiSelect';

describe('CategoryMultiSelect', () => {
  const categories = [
    'Deforestation',
    'Wildlife',
    'Fishing',
    'Agriculture',
    'Mining',
  ];
  const onToggle = vi.fn();
  const onClear = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all category chips', () => {
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Wildlife')).toBeInTheDocument();
    expect(screen.getByText('Fishing')).toBeInTheDocument();
    expect(screen.getByText('Agriculture')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
  });

  it('renders "All categories" chip when nothing selected', () => {
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('calls onToggle when a category chip is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByText('Deforestation'));
    expect(onToggle).toHaveBeenCalledWith('Deforestation');
  });

  it('calls onClear when "All categories" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={['Wildlife']}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByText('All categories'));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows selected chips with aria-pressed="true"', () => {
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={['Wildlife', 'Fishing']}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(screen.getByText('Wildlife')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Fishing')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Deforestation')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('returns null when categories array is empty', () => {
    const { container } = render(
      <CategoryMultiSelect
        categories={[]}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows "+N more" when more than 8 categories', () => {
    const manyCategories = Array.from({ length: 12 }, (_, i) => `Cat ${i + 1}`);
    render(
      <CategoryMultiSelect
        categories={manyCategories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(screen.getByText('+4 more')).toBeInTheDocument();
    // Only 8 + All categories button visible
    expect(screen.getByText('Cat 8')).toBeInTheDocument();
    expect(screen.queryByText('Cat 9')).not.toBeInTheDocument();
  });

  it('expands to show all categories when "+N more" is clicked', async () => {
    const user = userEvent.setup();
    const manyCategories = Array.from({ length: 12 }, (_, i) => `Cat ${i + 1}`);
    render(
      <CategoryMultiSelect
        categories={manyCategories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByText('+4 more'));
    expect(screen.getByText('Cat 9')).toBeInTheDocument();
    expect(screen.getByText('Cat 12')).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it('collapses when "Show less" is clicked', async () => {
    const user = userEvent.setup();
    const manyCategories = Array.from({ length: 12 }, (_, i) => `Cat ${i + 1}`);
    render(
      <CategoryMultiSelect
        categories={manyCategories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByText('+4 more'));
    await user.click(screen.getByText('Show less'));
    expect(screen.queryByText('Cat 9')).not.toBeInTheDocument();
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
  });

  it('does not show "+N more" when 8 or fewer categories', () => {
    render(
      <CategoryMultiSelect
        categories={categories}
        selected={[]}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });
});
