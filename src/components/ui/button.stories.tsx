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
 * Button rendered with an `onClick` spy. Visual story only — when the
 * Storybook 10 + vitest-browser `play()` hang is resolved upstream
 * (storybookjs/storybook#18663), this will be re-promoted to an
 * interaction test that asserts the spy is invoked. Tracked locally in
 * #103 (test(storybook): re-add play() interaction tests for PR #94
 * stories); for now the spy is registered but never called so it
 * appears in the actions panel without a false-positive test.
 *
 * TODO(#103): convert to `play()` interaction test.
 */
export const ClickHandler: Story = {
  args: {
    children: 'Submit',
    onClick: fn(),
  },
};

/**
 * Loading button with an `onClick` spy. The button must not invoke the
 * spy when `loading: true` is set. Visual story only — see
 * `ClickHandler` for the play() re-enable plan and #103 for the
 * tracking issue.
 *
 * TODO(#103): convert to `play()` interaction test that asserts the
 * spy is NOT invoked while `loading: true`.
 */
export const LoadingClickHandler: Story = {
  args: {
    loading: true,
    children: 'Loading',
    onClick: fn(),
  },
};
