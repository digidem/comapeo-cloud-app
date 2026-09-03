import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { CompactObservationFilterBarProps } from '@/components/shared/CompactObservationFilterBar';
import { CompactObservationFilterBar } from '@/components/shared/CompactObservationFilterBar';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

function makeProps(
  overrides: Partial<CompactObservationFilterBarProps> = {},
): CompactObservationFilterBarProps {
  return {
    filters: { ...DEFAULT_FILTERS },
    resultCount: 12,
    isFiltering: false,
    activeFilterCount: 0,
    onOpenFilters: vi.fn(),
    onSearchClear: vi.fn(),
    onStartDateClear: vi.fn(),
    onEndDateClear: vi.fn(),
    onCategoryRemove: vi.fn(),
    ...overrides,
  };
}

function renderBar(overrides: Partial<CompactObservationFilterBarProps> = {}) {
  return render(<CompactObservationFilterBar {...makeProps(overrides)} />);
}

function getFiltersButton() {
  return screen.getByRole('button', { name: /^Filters/ });
}

describe('CompactObservationFilterBar', () => {
  it('renders the Filters button and the result count when not filtering', () => {
    renderBar();

    expect(getFiltersButton()).toBeInTheDocument();
    expect(getFiltersButton()).toHaveClass('shrink-0');

    const count = screen.getByText('12 results');
    expect(count).toHaveClass('shrink-0');

    // Badge is hidden when nothing is filtered
    expect(screen.queryByLabelText('0 active filters')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Active filters' }),
    ).not.toBeInTheDocument();
  });

  it('renders the badge with the active filter dimension count when filtering', () => {
    renderBar({ isFiltering: true, activeFilterCount: 3 });

    const badge = screen.getByLabelText('3 active filters');
    expect(badge).toHaveTextContent('3');
  });

  it('hides the badge when the active filter count is 0', () => {
    renderBar({ isFiltering: true, activeFilterCount: 0 });

    expect(screen.queryByLabelText('0 active filters')).not.toBeInTheDocument();
  });

  it('renders one chip per active filter dimension and one per selected category', () => {
    renderBar({
      isFiltering: true,
      activeFilterCount: 4,
      filters: {
        ...DEFAULT_FILTERS,
        search: 'logger',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        categories: ['Wildlife', 'Fishing'],
      },
    });

    expect(screen.getByText('Search: logger')).toBeInTheDocument();
    // Date chips render the raw ISO date string (locale-neutral)
    expect(screen.getByText('From: 2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('To: 2026-02-01')).toBeInTheDocument();
    expect(screen.getByText('Category: Wildlife')).toBeInTheDocument();
    expect(screen.getByText('Category: Fishing')).toBeInTheDocument();
  });

  it('renders no chips when not filtering', () => {
    renderBar({
      isFiltering: false,
      filters: {
        ...DEFAULT_FILTERS,
        search: 'logger',
        categories: ['Wildlife'],
      },
    });

    expect(screen.queryByText('Search: logger')).not.toBeInTheDocument();
    expect(screen.queryByText('Category: Wildlife')).not.toBeInTheDocument();
  });

  it('clears the search filter from its chip', async () => {
    const user = userEvent.setup();
    const onSearchClear = vi.fn();
    renderBar({
      isFiltering: true,
      activeFilterCount: 1,
      filters: { ...DEFAULT_FILTERS, search: 'logger' },
      onSearchClear,
    });

    await user.click(
      screen.getByRole('button', { name: 'Remove filter: Search: logger' }),
    );
    expect(onSearchClear).toHaveBeenCalledOnce();
  });

  it('clears the start date from its chip', async () => {
    const user = userEvent.setup();
    const onStartDateClear = vi.fn();
    renderBar({
      isFiltering: true,
      activeFilterCount: 1,
      filters: { ...DEFAULT_FILTERS, startDate: '2026-01-01' },
      onStartDateClear,
    });

    await user.click(
      screen.getByRole('button', { name: 'Remove filter: From: 2026-01-01' }),
    );
    expect(onStartDateClear).toHaveBeenCalledOnce();
  });

  it('clears the end date from its chip', async () => {
    const user = userEvent.setup();
    const onEndDateClear = vi.fn();
    renderBar({
      isFiltering: true,
      activeFilterCount: 1,
      filters: { ...DEFAULT_FILTERS, endDate: '2026-02-01' },
      onEndDateClear,
    });

    await user.click(
      screen.getByRole('button', { name: 'Remove filter: To: 2026-02-01' }),
    );
    expect(onEndDateClear).toHaveBeenCalledOnce();
  });

  it('removes exactly the selected category from its chip', async () => {
    const user = userEvent.setup();
    const onCategoryRemove = vi.fn();
    renderBar({
      isFiltering: true,
      activeFilterCount: 1,
      filters: { ...DEFAULT_FILTERS, categories: ['Wildlife', 'Fishing'] },
      onCategoryRemove,
    });

    await user.click(
      screen.getByRole('button', { name: 'Remove filter: Category: Wildlife' }),
    );
    expect(onCategoryRemove).toHaveBeenCalledOnce();
    expect(onCategoryRemove).toHaveBeenCalledWith('Wildlife');
    expect(onCategoryRemove).not.toHaveBeenCalledWith('Fishing');
  });

  it('opens the filters sheet from the Filters button', async () => {
    const user = userEvent.setup();
    const onOpenFilters = vi.fn();
    renderBar({ onOpenFilters });

    await user.click(getFiltersButton());
    expect(onOpenFilters).toHaveBeenCalledOnce();
  });

  it('renders a single non-wrapping, keyboard-scrollable chip row', () => {
    renderBar({
      isFiltering: true,
      activeFilterCount: 4,
      filters: {
        ...DEFAULT_FILTERS,
        search: 'logger',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        categories: ['Wildlife'],
      },
    });

    const row = screen.getByRole('group', { name: 'Active filters' });
    expect(row).toHaveClass('min-w-0', 'overflow-x-auto', 'flex-nowrap');
    expect(row).toHaveAttribute('tabindex', '0');

    // Every chip stays reachable: chips never shrink inside the scroll row
    for (const label of [
      'Search: logger',
      'From: 2026-01-01',
      'To: 2026-02-01',
      'Category: Wildlife',
    ]) {
      expect(screen.getByText(label)).toHaveClass('shrink-0');
    }
  });

  it('uses the singular plural form for a single result', () => {
    renderBar({ resultCount: 1 });
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });
});
