import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { CategoryFilterSheetProps } from '@/components/shared/CategoryFilterSheet';
import { CategoryFilterSheet } from '@/components/shared/CategoryFilterSheet';

const categories = [
  'Deforestation',
  'Wildlife',
  'Fishing',
  'Agriculture',
  'Mining',
];

const defaultProps: CategoryFilterSheetProps = {
  open: true,
  onOpenChange: vi.fn(),
  categories,
  selected: [],
  onToggle: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
};

function renderSheet(overrides: Partial<CategoryFilterSheetProps> = {}) {
  return render(<CategoryFilterSheet {...defaultProps} {...overrides} />);
}

describe('CategoryFilterSheet', () => {
  it('renders a checkbox row for each category when open', () => {
    renderSheet();
    for (const category of categories) {
      expect(
        screen.getByRole('checkbox', { name: category }),
      ).toBeInTheDocument();
    }
  });

  it('marks selected categories as checked (aria-checked true)', () => {
    renderSheet({ selected: ['Wildlife', 'Fishing'] });
    expect(screen.getByRole('checkbox', { name: 'Wildlife' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Fishing' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByRole('checkbox', { name: 'Deforestation' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onToggle with the category when a row is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderSheet({ onToggle });
    await user.click(screen.getByRole('checkbox', { name: 'Wildlife' }));
    expect(onToggle).toHaveBeenCalledWith('Wildlife');
  });

  it('calls onSelectAll when "Select all" is clicked', async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    // Not all categories selected so the button is enabled
    renderSheet({ onSelectAll, selected: ['Wildlife'] });
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('calls onDeselectAll when "Deselect all" is clicked', async () => {
    const user = userEvent.setup();
    const onDeselectAll = vi.fn();
    renderSheet({ onDeselectAll, selected: ['Wildlife'] });
    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(onDeselectAll).toHaveBeenCalledOnce();
  });

  it('disables "Select all" when all categories are selected', () => {
    renderSheet({ selected: [...categories] });
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
  });

  it('has a "Select all" / "Deselect all" button pair with 44px touch targets', () => {
    renderSheet({ selected: ['Wildlife'] });
    const selectAll = screen.getByRole('button', { name: 'Select all' });
    const deselectAll = screen.getByRole('button', { name: 'Deselect all' });
    expect(selectAll).toBeInTheDocument();
    expect(deselectAll).toBeInTheDocument();
    expect(selectAll).toHaveAttribute('type', 'button');
    expect(deselectAll).toHaveAttribute('type', 'button');
    // 44px+ touch target
    expect(selectAll).toHaveClass('min-h-[44px]');
    expect(deselectAll).toHaveClass('min-h-[44px]');
  });

  it('calls onOpenChange(false) when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Close categories' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders a scrollable container for the category list', () => {
    const { container } = renderSheet();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const scrollable = container.querySelector('.overflow-y-auto');
    expect(scrollable).not.toBeNull();
  });

  it('renders an empty state when there are no categories', () => {
    renderSheet({ categories: [] });
    expect(screen.getByText('No categories available')).toBeInTheDocument();
  });

  it('does not render dialog content when open is false', () => {
    renderSheet({ open: false });
    expect(screen.queryByText('Categories')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Deforestation' }),
    ).not.toBeInTheDocument();
  });

  it('renders a dialog title for accessibility', () => {
    renderSheet();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Select all is enabled when a stale selection does not match the available categories', () => {
    renderSheet({ selected: ['Wildlife'], categories: ['Mining', 'Forest'] });
    expect(
      screen.getByRole('button', { name: 'Select all' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Deselect all' }),
    ).not.toBeDisabled();
  });

  it('Select all and Deselect all are disabled when there are no categories', () => {
    renderSheet({ categories: [] });
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeDisabled();
  });

  it('Select all is disabled when all available categories are selected', () => {
    renderSheet({
      selected: ['Mining', 'Forest'],
      categories: ['Mining', 'Forest'],
    });
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Deselect all' }),
    ).not.toBeDisabled();
  });
});
