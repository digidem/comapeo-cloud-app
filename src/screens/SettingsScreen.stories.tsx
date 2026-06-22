import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent } from 'storybook/test';

import { PLAY_TIMEOUT, getCanvas } from '@/stories/test-utils';

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
    const canvas = getCanvas();
    const urlInput = await canvas.findByLabelText(
      'Remote Archive URL',
      undefined,
      { timeout: PLAY_TIMEOUT },
    );
    const tokenInput = await canvas.findByLabelText('Bearer Token', undefined, {
      timeout: PLAY_TIMEOUT,
    });

    await userEvent.type(urlInput, 'https://archive.example.com');
    await userEvent.type(tokenInput, 'my-secret-token');

    await expect(urlInput).toHaveValue('https://archive.example.com');
    await expect(tokenInput).toHaveValue('my-secret-token');
  },
};

/** Invite form showing an error state */
export const InviteFormError: Story = {
  play: async () => {
    const canvas = getCanvas();
    // Submit empty form to trigger validation errors
    const submitButton = await canvas.findByRole(
      'button',
      { name: 'Generate Invite' },
      { timeout: PLAY_TIMEOUT },
    );
    await userEvent.click(submitButton);

    const errorMessages = await canvas.findAllByText('Required', undefined, {
      timeout: PLAY_TIMEOUT,
    });
    await expect(errorMessages).toHaveLength(2);
    for (const errorMessage of errorMessages) {
      await expect(errorMessage).toBeVisible();
    }
  },
};

/** Scrolled to Backup & Restore section */
export const ScrolledToBackup: Story = {
  play: async () => {
    const canvas = getCanvas();
    const backupHeading = await canvas.findByRole(
      'heading',
      { name: /backup/i, level: 2 },
      { timeout: PLAY_TIMEOUT },
    );
    backupHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
    await expect(backupHeading).toBeVisible();
  },
};

/** Clear data confirm dialog open */
export const ClearDataDialogOpen: Story = {
  play: async () => {
    const canvas = getCanvas();
    const clearButton = await canvas.findByRole(
      'button',
      { name: 'Clear All Data' },
      { timeout: PLAY_TIMEOUT },
    );
    await userEvent.click(clearButton);

    // Assert the confirm dialog is present (state-based, not time-based)
    const dialog = await canvas.findByRole('dialog', undefined, {
      timeout: PLAY_TIMEOUT,
    });
    await expect(dialog).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Clear All Data?' }),
    ).toBeInTheDocument();
  },
};
