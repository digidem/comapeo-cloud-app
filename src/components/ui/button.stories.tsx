import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

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
 * Interaction test: clicking fires onClick, loading blocks clicks.
 */
export const Test: Story = {
  args: {
    children: 'Submit',
    onClick: fn(),
  },
  play: async ({ args, canvasElement, step }) => {
    await waitFor(
      () => {
        const prep = canvasElement.ownerDocument.querySelector(
          '.sb-preparing-story',
        );
        if (prep) throw new Error('story still preparing');
      },
      { timeout: 10_000 },
    );

    const canvas = within(canvasElement);

    await step('renders the label', async () => {
      await expect(
        canvas.findByRole('button', { name: 'Submit' }),
      ).resolves.toBeInTheDocument();
    });

    await step('fires onClick when pressed', async () => {
      const button = await canvas.findByRole('button', { name: 'Submit' });
      await userEvent.click(button);
      await expect(args.onClick).toHaveBeenCalledTimes(1);
    });
  },
};

/**
 * A loading button is disabled and does not fire onClick.
 */
export const LoadingBlocksClicks: Story = {
  args: {
    loading: true,
    children: 'Loading',
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await waitFor(
      () => {
        const prep = canvasElement.ownerDocument.querySelector(
          '.sb-preparing-story',
        );
        if (prep) throw new Error('story still preparing');
      },
      { timeout: 10_000 },
    );

    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button');

    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
