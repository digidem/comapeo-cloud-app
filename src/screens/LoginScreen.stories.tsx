import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { LoginScreen } from './LoginScreen';

const meta: Meta<typeof LoginScreen> = {
  title: 'Screens/Login',
  component: LoginScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof LoginScreen>;

export const Default: Story = {};

// Note: a `play()` interaction test was attempted in an earlier revision of
// this story (typing a URL into the URL input), but LoginScreen is currently
// a placeholder stub that renders only `<div>Login</div>`. The test-runner
// and addon-vitest story projects (#94 + #95) would fail immediately on
// `getByRole('textbox')` because no such role exists in the rendered DOM.
// Re-introduce a play() story once LoginScreen has a real URL input — at
// that point a test like
//
//   await userEvent.type(canvas.getByRole('textbox'), 'https://example.com');
//   await expect(input).toHaveValue('https://example.com');
//
// will both exercise the user flow and gate against the input going missing
// in a future refactor.
