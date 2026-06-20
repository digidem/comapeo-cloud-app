import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';

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
    const canvas = within(document.body);
    const backupHeading = await canvas.findByRole(
      'heading',
      { name: /backup/i, level: 2 },
      { timeout: 5_000 },
    );
    backupHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
    await expect(backupHeading).toBeVisible();
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

    // Assert the confirm dialog is present (state-based, not time-based)
    const dialog = await canvas.findByRole('dialog', undefined, {
      timeout: 5_000,
    });
    await expect(dialog).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Clear All Data?' }),
    ).toBeInTheDocument();
  },
};
