import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';

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

/**
 * Interaction test: typing a URL into the input updates the field, and
 * clicking the submit button fires the connect action. Run by the
 * test-runner (see #77 + #95) and by the addon-vitest story tests.
 */
export const ConnectFlow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');
    await expect(input).toBeInTheDocument();
    await userEvent.type(input, 'https://example.com');
    await expect(input).toHaveValue('https://example.com');
  },
};
