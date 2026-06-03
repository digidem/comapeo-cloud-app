import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { PaginationControls } from '@/components/shared/PaginationControls';

const meta: Meta<typeof PaginationControls> = {
  title: 'Components/PaginationControls',
  component: PaginationControls,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof PaginationControls>;

const noop = () => {};

export const Default: Story = {
  args: {
    showingStart: 1,
    showingEnd: 20,
    totalCount: 156,
    hasMore: true,
    onLoadMore: noop,
  },
};

export const AllLoaded: Story = {
  args: {
    showingStart: 1,
    showingEnd: 42,
    totalCount: 42,
    hasMore: false,
    onLoadMore: noop,
  },
};

export const CustomItemLabel: Story = {
  args: {
    showingStart: 1,
    showingEnd: 10,
    totalCount: 35,
    hasMore: true,
    onLoadMore: noop,
    itemLabel: 'alerts',
  },
};
