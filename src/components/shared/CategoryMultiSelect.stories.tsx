import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { CategoryMultiSelect } from '@/components/shared/CategoryMultiSelect';

const meta: Meta<typeof CategoryMultiSelect> = {
  title: 'Components/CategoryMultiSelect',
  component: CategoryMultiSelect,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof CategoryMultiSelect>;

const noop = () => {};

const categories = [
  'Water Quality',
  'Wildlife',
  'Forest Cover',
  'Soil Analysis',
  'Air Quality',
];

export const Default: Story = {
  args: {
    categories,
    selected: [],
    onToggle: noop,
    onClear: noop,
  },
};

export const WithSelection: Story = {
  args: {
    categories,
    selected: ['Wildlife', 'Forest Cover'],
    onToggle: noop,
    onClear: noop,
  },
};

export const ManyCategories: Story = {
  args: {
    categories: [
      ...categories,
      'Erosion',
      'Mining',
      'Logging',
      'Hunting',
      'Fishing',
    ],
    selected: ['Mining'],
    onToggle: noop,
    onClear: noop,
  },
};
