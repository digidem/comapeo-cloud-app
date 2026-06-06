import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { FilterSheet } from '@/components/shared/FilterSheet';
import type { ObservationFilterBarProps } from '@/components/shared/ObservationFilterBar';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

const meta: Meta<typeof FilterSheet> = {
  title: 'Components/FilterSheet',
  component: FilterSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FilterSheet>;

const noop = () => {};

const defaultFilterProps: ObservationFilterBarProps = {
  filters: DEFAULT_FILTERS,
  availableCategories: [],
  resultCount: 0,
  isFiltering: false,
  onSearchChange: noop,
  onStartDateChange: noop,
  onEndDateChange: noop,
  onCategoryToggle: noop,
  onCategoriesClear: noop,
  onSortChange: noop,
  onClear: noop,
};

export const Closed: Story = {
  args: {
    open: false,
    onOpenChange: noop,
    ...defaultFilterProps,
  },
};

/**
 * Open filter sheet.
 *
 * TODO: Re-enable play() tests when Storybook vitest-browser rendering
 * issue is resolved (stories with play() hang in sb-preparing-story state).
 * @see https://github.com/storybookjs/storybook/issues/18663
 */
export const Open: Story = {
  args: {
    open: true,
    onOpenChange: noop,
    ...defaultFilterProps,
  },
};

export const WithCategorySelected: Story = {
  args: {
    open: true,
    onOpenChange: noop,
    ...defaultFilterProps,
    filters: {
      ...DEFAULT_FILTERS,
      categories: ['Water Quality'],
    },
    availableCategories: ['Water Quality', 'Wildlife', 'Forest Cover'],
    resultCount: 15,
    isFiltering: true,
  },
};
