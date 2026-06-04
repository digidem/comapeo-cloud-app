import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';

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

/**
 * Interaction test: clicking fires onClick.
 *
 * TODO: Re-enable play() tests when Storybook vitest-browser rendering
 * issue is resolved (stories with play() hang in sb-preparing-story state).
 * @see https://github.com/storybookjs/storybook/issues/18663
 */
export const Test: Story = {
  args: {
    children: 'Submit',
    onClick: fn(),
  },
};

/**
 * Loading button should be disabled and not fire onClick.
 *
 * TODO: Re-enable play() tests — see Test story above.
 */
export const LoadingBlocksClicks: Story = {
  args: {
    loading: true,
    children: 'Loading',
    onClick: fn(),
  },
};
