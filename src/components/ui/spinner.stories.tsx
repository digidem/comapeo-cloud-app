import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Spinner } from '@/components/ui/spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Components/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: { type: 'number' },
      defaultValue: 24,
    },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const Size16: Story = {
  args: { size: 16 },
};

export const Size32: Story = {
  args: { size: 32 },
};

export const Size48: Story = {
  args: { size: 48 },
};
