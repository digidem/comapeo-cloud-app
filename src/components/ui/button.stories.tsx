import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, fn, userEvent } from 'storybook/test';

import { Button } from '@/components/ui/button';

import { getCanvas } from '../../stories/test-utils';

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
 */
export const ClickHandler: Story = {
  args: {
    children: 'Submit',
    onClick: fn(),
  },
  play: async ({ args, step }) => {
    const canvas = getCanvas();

    await step('renders the label', async () => {
      await expect(
        canvas.findByRole('button', { name: 'Submit' }, { timeout: 5_000 }),
      ).resolves.toBeInTheDocument();
    });

    await step('fires onClick when pressed', async () => {
      const button = await canvas.findByRole(
        'button',
        { name: 'Submit' },
        { timeout: 5_000 },
      );
      await userEvent.click(button);
      await expect(args.onClick).toHaveBeenCalledTimes(1);
    });
  },
};

/**
 * A loading button is disabled and does not fire onClick.
 */
export const LoadingClickHandler: Story = {
  args: {
    loading: true,
    children: 'Loading',
    onClick: fn(),
  },
  play: async ({ args }) => {
    const canvas = getCanvas();
    const button = await canvas.findByRole('button', undefined, {
      timeout: 5_000,
    });

    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
