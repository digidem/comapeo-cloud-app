import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Button } from '@/components/ui/button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
  args: {
    variant: 'primary',
    size: 'md',
    children: 'Button',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

/** Default primary button */
export const Primary: Story = {};

/** Secondary button — white surface with border */
export const Secondary: Story = {
  args: { variant: 'secondary' },
};

/** Ghost button — transparent until hover */
export const Ghost: Story = {
  args: { variant: 'ghost' },
};

/** Danger button — destructive actions */
export const Danger: Story = {
  args: { variant: 'danger' },
};

/** Loading state shows a spinner and disables interaction */
export const Loading: Story = {
  args: { loading: true, children: 'Saving…' },
};

/** Disabled state */
export const Disabled: Story = {
  args: { disabled: true },
};
