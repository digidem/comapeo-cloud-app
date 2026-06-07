import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { userEvent, within } from 'storybook/test';

import { SettingsScreen } from './SettingsScreen';

const meta: Meta<typeof SettingsScreen> = {
  title: 'Screens/Settings',
  component: SettingsScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsScreen>;

/** Default state — empty form, no results */
export const Default: Story = {};

/** Invite form filled with valid data (before submit) */
export const InviteFormFilled: Story = {
  play: async () => {
    const canvas = within(document.body);
    const urlInput = await canvas.findByLabelText(
      'Remote Archive URL',
      undefined,
      { timeout: 5_000 },
    );
    const tokenInput = await canvas.findByLabelText('Bearer Token', undefined, {
      timeout: 5_000,
    });

    await userEvent.type(urlInput, 'https://archive.example.com');
    await userEvent.type(tokenInput, 'my-secret-token');
  },
};

/** Invite form after successful generation — shows invite URL and code */
export const WithInviteResults: Story = {
  play: async () => {
    const canvas = within(document.body);
    const urlInput = await canvas.findByLabelText(
      'Remote Archive URL',
      undefined,
      { timeout: 5_000 },
    );
    const tokenInput = await canvas.findByLabelText('Bearer Token', undefined, {
      timeout: 5_000,
    });

    await userEvent.type(urlInput, 'https://archive.example.com');
    await userEvent.type(tokenInput, 'my-secret-token');

    const submitButton = await canvas.findByRole(
      'button',
      { name: 'Generate Invite' },
      { timeout: 5_000 },
    );
    await userEvent.click(submitButton);

    // Wait for the results to appear
    await new Promise((r) => setTimeout(r, 500));
  },
};

/** Invite form showing an error state */
export const InviteFormError: Story = {
  play: async () => {
    const canvas = within(document.body);
    // Submit empty form to trigger validation errors
    const submitButton = await canvas.findByRole(
      'button',
      { name: 'Generate Invite' },
      { timeout: 5_000 },
    );
    await userEvent.click(submitButton);
  },
};

/** Scrolled to Backup & Restore section */
export const ScrolledToBackup: Story = {
  play: async () => {
    // Wait for render
    await new Promise((r) => setTimeout(r, 300));
    const headings = document.body.querySelectorAll('h2');
    for (const h of headings) {
      if (h.textContent?.includes('Backup')) {
        h.scrollIntoView({ behavior: 'instant', block: 'start' });
        break;
      }
    }
  },
};

/** Clear data confirm dialog open */
export const ClearDataDialogOpen: Story = {
  play: async () => {
    const canvas = within(document.body);
    const clearButton = await canvas.findByRole(
      'button',
      { name: 'Clear All Data' },
      { timeout: 5_000 },
    );
    await userEvent.click(clearButton);

    // Wait for dialog animation
    await new Promise((r) => setTimeout(r, 300));
  },
};
