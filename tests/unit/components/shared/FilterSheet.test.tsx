import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@tests/mocks/test-utils';
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

describe('FilterSheet variant="right" (desktop drawer)', () => {
  function getDialogContent(): HTMLElement {
    const dialogs = screen.getAllByRole('dialog');
    // The outer sheet content precedes the nested category sheet content
    return dialogs[0] as HTMLElement;
  }

  it('renders right-edge drawer positioning and drops bottom-sheet chrome', () => {
    renderSheet({ variant: 'right' });

    const content = getDialogContent();
    expect(content).toHaveClass('fixed', 'right-0', 'top-0', 'bottom-0');
    expect(content).toHaveClass('w-[min(380px,90vw)]');
    expect(content).toHaveClass('animate-slide-in-right');
    expect(content).not.toHaveClass('max-h-[85vh]');
    expect(content).not.toHaveClass('rounded-t-card');

    // The drag handle is a bottom-sheet affordance (content portals to body)
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.body.querySelector('.h-1.w-10')).toBeNull();
  });

  it('keeps the bottom sheet as the default variant', () => {
    renderSheet();

    const content = getDialogContent();
    expect(content).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0');
    expect(content).toHaveClass('max-h-[85vh]', 'rounded-t-card');
    expect(content).not.toHaveClass('top-0');
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.body.querySelector('.h-1.w-10')).not.toBeNull();
  });

  it('closes on Apply while the right drawer is open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ variant: 'right', onOpenChange });

    const apply = screen.getByRole('button', { name: 'Show results' });
    await user.click(apply);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ variant: 'right', onOpenChange });

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on outside pointer-down', async () => {
    const onOpenChange = vi.fn();
    renderSheet({ variant: 'right', onOpenChange });

    // Radix attaches its outside-pointer-down listener on a timeout, and marks
    // body pointer-events:none while the modal is open (so user-event refuses
    // a click there) — let that timeout elapse, then dispatch the pointer
    // event directly.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens the nested category sheet inside the drawer (variant="drawer")', async () => {
    const user = userEvent.setup();
    const onCategoryToggle = vi.fn();
    renderSheet({ variant: 'right', onCategoryToggle });

    await user.click(screen.getByRole('button', { name: /Categories/ }));

    // Nested category sheet is the second dialog, positioned within the drawer
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    const categoryContent = dialogs[1] as HTMLElement;
    expect(categoryContent).toHaveClass('absolute', 'inset-0');
    expect(categoryContent).not.toHaveClass('fixed');
    expect(categoryContent).not.toHaveClass('bottom-0');

    // In-drawer dim layer: absolute inside the drawer, below the category content
    // eslint-disable-next-line testing-library/no-node-access
    const drawerOverlays = (dialogs[0] as HTMLElement).querySelectorAll(
      '[data-category-sheet-overlay]',
    );
    expect(drawerOverlays).toHaveLength(1);
    const drawerOverlay = drawerOverlays[0] as HTMLElement;
    expect(drawerOverlay.style.position).toBe('absolute');
    // eslint-disable-next-line testing-library/no-node-access
    expect(drawerOverlay.parentElement).toBe(categoryContent.parentElement);

    await user.click(screen.getByRole('checkbox', { name: 'Wildlife' }));
    expect(onCategoryToggle).toHaveBeenCalledWith('Wildlife');
  });

  it('keeps the Select portal container inside the drawer content', async () => {
    const user = userEvent.setup();
    renderSheet({ variant: 'right', showSort: true });

    const content = getDialogContent();
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(content.contains(screen.getByRole('listbox'))).toBe(true);
  });
});
