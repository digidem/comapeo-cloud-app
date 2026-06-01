import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ObservationFilterBar } from '@/components/shared/ObservationFilterBar';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

const meta: Meta<typeof ObservationFilterBar> = {
  title: 'Components/ObservationFilterBar',
  component: ObservationFilterBar,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof ObservationFilterBar>;

const noop = () => {};

export const Default: Story = {
  args: {
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
  },
};

export const WithCategories: Story = {
  args: {
    filters: DEFAULT_FILTERS,
    availableCategories: [
      'Water Quality',
      'Wildlife',
      'Forest Cover',
      'Soil Analysis',
    ],
    resultCount: 42,
    isFiltering: false,
    onSearchChange: noop,
    onStartDateChange: noop,
    onEndDateChange: noop,
    onCategoryToggle: noop,
    onCategoriesClear: noop,
    onSortChange: noop,
    onClear: noop,
  },
};

export const CategorySelected: Story = {
  args: {
    filters: {
      ...DEFAULT_FILTERS,
      categories: ['Water Quality'],
    },
    availableCategories: ['Water Quality', 'Wildlife', 'Forest Cover'],
    resultCount: 15,
    isFiltering: true,
    onSearchChange: noop,
    onStartDateChange: noop,
    onEndDateChange: noop,
    onCategoryToggle: noop,
    onCategoriesClear: noop,
    onSortChange: noop,
    onClear: noop,
  },
};

export const WithSearch: Story = {
  args: {
    filters: {
      ...DEFAULT_FILTERS,
      search: 'water',
    },
    availableCategories: ['Water Quality', 'Wildlife', 'Forest Cover'],
    resultCount: 8,
    isFiltering: true,
    onSearchChange: noop,
    onStartDateChange: noop,
    onEndDateChange: noop,
    onCategoryToggle: noop,
    onCategoriesClear: noop,
    onSortChange: noop,
    onClear: noop,
  },
};

export const WithPagination: Story = {
  args: {
    filters: DEFAULT_FILTERS,
    availableCategories: [
      'Water Quality',
      'Wildlife',
      'Forest Cover',
      'Soil Analysis',
      'Air Quality',
    ],
    resultCount: 156,
    isFiltering: false,
    onSearchChange: noop,
    onStartDateChange: noop,
    onEndDateChange: noop,
    onCategoryToggle: noop,
    onCategoriesClear: noop,
    onSortChange: noop,
    onClear: noop,
  },
};
