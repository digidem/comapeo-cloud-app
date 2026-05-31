import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Skeleton } from '@/components/ui/skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    width: {
      control: { type: 'text' },
    },
    height: {
      control: { type: 'text' },
    },
  },
  args: {
    width: '100%',
    height: 16,
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

/** Default skeleton — full width, 16px height */
export const Default: Story = {};

/** Simulates a single line of text */
export const TextLine: Story = {
  args: {
    width: 200,
    height: 24,
  },
};

/** Simulates a card placeholder */
export const CardPlaceholder: Story = {
  args: {
    width: '100%',
    height: 100,
  },
};

/** Circular avatar placeholder */
export const Avatar: Story = {
  args: {
    width: 48,
    height: 48,
    className: 'rounded-full',
  },
};

/** Multiple stacked skeletons simulating a paragraph */
export const MultiLine: Story = {
  render: () => (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 300 }}
    >
      <Skeleton width="100%" height={16} />
      <Skeleton width="85%" height={16} />
      <Skeleton width="70%" height={16} />
    </div>
  ),
};
