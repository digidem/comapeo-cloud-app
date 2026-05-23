import { fireEvent, render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ObservationFilterBarProps } from '@/components/shared/ObservationFilterBar';
import { ObservationFilterBar } from '@/components/shared/ObservationFilterBar';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderBar(
  overrides: Partial<ObservationFilterBarProps> = {},
): ObservationFilterBarProps {
  const props: ObservationFilterBarProps = {
    filters: DEFAULT_FILTERS,
    availableCategories: ['forest', 'water'],
    resultCount: 5,
    isFiltering: false,
    onSearchChange: vi.fn(),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onSortChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<ObservationFilterBar {...props} />);
  return props;
}

describe('ObservationFilterBar', () => {
  it('renders search input with label', () => {
    renderBar();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders start date input with label', () => {
    renderBar();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
  });

  it('renders end date input with label', () => {
    renderBar();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('renders category select with all categories option', () => {
    renderBar();
    // The category select should have an aria-label
    const categoryTrigger = screen.getByRole('combobox', { name: 'Category' });
    expect(categoryTrigger).toBeInTheDocument();
  });

  it('renders sort select', () => {
    renderBar();
    const sortTrigger = screen.getByRole('combobox', { name: 'Sort' });
    expect(sortTrigger).toBeInTheDocument();
  });

  it('shows result count', () => {
    renderBar({ resultCount: 5 });
    expect(screen.getByText('5 results')).toBeInTheDocument();
  });

  it('shows singular result count', () => {
    renderBar({ resultCount: 1 });
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('typing in search fires onSearchChange', () => {
    const props = renderBar();
    const searchInput = screen.getByLabelText('Search');
    fireEvent.change(searchInput, { target: { value: 'forest' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('forest');
  });

  it('changing start date fires onStartDateChange', () => {
    const props = renderBar();
    const startInput = screen.getByLabelText('From');
    fireEvent.change(startInput, { target: { value: '2024-03-15' } });
    expect(props.onStartDateChange).toHaveBeenCalledWith('2024-03-15');
  });

  it('changing end date fires onEndDateChange', () => {
    const props = renderBar();
    const endInput = screen.getByLabelText('To');
    fireEvent.change(endInput, { target: { value: '2024-03-16' } });
    expect(props.onEndDateChange).toHaveBeenCalledWith('2024-03-16');
  });

  it('hides Clear filters button when isFiltering is false', () => {
    renderBar({ isFiltering: false });
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('shows Clear filters button when isFiltering is true and fires onClear', () => {
    const props = renderBar({ isFiltering: true });
    const clearButton = screen.getByText('Clear filters');
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);
    expect(props.onClear).toHaveBeenCalledOnce();
  });

  it('selecting "All categories" passes null to onCategoryChange', async () => {
    const user = userEvent.setup();
    // Start with a non-null category so that selecting "All categories" triggers a change
    const props = renderBar({
      filters: { ...DEFAULT_FILTERS, category: 'forest' },
    });
    // Open the category select dropdown
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    // Find and click the "All categories" option
    const allCategoriesOption = await screen.findByRole('option', {
      name: 'All categories',
    });
    await user.click(allCategoriesOption);
    // Should map the sentinel value to null
    expect(props.onCategoryChange).toHaveBeenCalledWith(null);
  });

  it('renders search placeholder text', () => {
    renderBar();
    const searchInput = screen.getByPlaceholderText(
      'Search by category or notes',
    );
    expect(searchInput).toBeInTheDocument();
  });
});
