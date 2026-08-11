import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { FilterSheetProps } from '@/components/shared/FilterSheet';
import { FilterSheet } from '@/components/shared/FilterSheet';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const categories = [
  'Deforestation',
  'Wildlife',
  'Fishing',
  'Agriculture',
  'Mining',
];

const defaultProps: FilterSheetProps = {
  filters: { ...DEFAULT_FILTERS, categories: [] },
  availableCategories: categories,
  resultCount: 12,
  isFiltering: false,
  onSearchChange: vi.fn(),
  onStartDateChange: vi.fn(),
  onEndDateChange: vi.fn(),
  onCategoryToggle: vi.fn(),
  onCategoriesClear: vi.fn(),
  onSortChange: vi.fn(),
  onClear: vi.fn(),
  onCategoriesSelectAll: vi.fn(),
  open: true,
  onOpenChange: vi.fn(),
};

function renderSheet(overrides: Partial<FilterSheetProps> = {}) {
  return render(<FilterSheet {...defaultProps} {...overrides} />);
}

describe('FilterSheet', () => {
  it('renders the Categories trigger button and search input when open', () => {
    renderSheet();
    expect(
      screen.getByRole('button', { name: /Categories/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('shows "All categories" on the trigger when no categories are selected', () => {
    renderSheet();
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('shows "2 selected" on the trigger when categories are selected', () => {
    renderSheet({
      filters: { ...DEFAULT_FILTERS, categories: ['Wildlife', 'Fishing'] },
    });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows category checkboxes after opening the Categories trigger', async () => {
    const user = userEvent.setup();
    renderSheet();
    const trigger = screen.getByRole('button', { name: /Categories/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('checkbox', { name: 'Wildlife' }),
    ).toBeInTheDocument();
  });

  it('calls onCategoriesSelectAll when "Select all" is clicked', async () => {
    const user = userEvent.setup();
    const onCategoriesSelectAll = vi.fn();
    renderSheet({ onCategoriesSelectAll });
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onCategoriesSelectAll).toHaveBeenCalledOnce();
  });

  it('calls onCategoriesClear when "Deselect all" is clicked', async () => {
    const user = userEvent.setup();
    const onCategoriesClear = vi.fn();
    renderSheet({
      onCategoriesClear,
      filters: { ...DEFAULT_FILTERS, categories: ['Wildlife'] },
    });
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(onCategoriesClear).toHaveBeenCalledOnce();
  });

  it('closes the sheet and calls onOpenChange(false) when "Show results" is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Wildlife' }),
    ).toBeInTheDocument();
    // The "Show results" button lives in the outer sheet content, which Radix
    // marks aria-hidden + pointer-events:none while the nested category sheet
    // is open (mirroring real inert behaviour). Dispatch the click directly.
    const showResults = screen.getByRole('button', {
      name: 'Show results',
      hidden: true,
    });
    fireEvent.click(showResults);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole('checkbox', { name: 'Wildlife' }),
    ).not.toBeInTheDocument();
  });

  it('resets the category sheet after the outer sheet closes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSheet();
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Wildlife' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Close filters', hidden: true }),
    );
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    rerender(<FilterSheet {...defaultProps} open={false} />);
    rerender(<FilterSheet {...defaultProps} open />);

    expect(
      screen.queryByRole('checkbox', { name: 'Wildlife' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Wildlife' }),
    ).toBeInTheDocument();
  });

  it('hides the inline category multi-select chips', () => {
    renderSheet();
    expect(screen.queryByText('Filter by category')).not.toBeInTheDocument();
  });

  it('shows "No categories available" when there are no available categories', async () => {
    const user = userEvent.setup();
    renderSheet({ availableCategories: [] });
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    expect(screen.getByText('No categories available')).toBeInTheDocument();
  });

  it('restores focus to the categories trigger after the category sheet closes', async () => {
    const user = userEvent.setup();
    renderSheet();
    const trigger = screen.getByRole('button', { name: /Categories/ });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Close categories' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
