import type { Meta, StoryObj } from '@storybook/tanstack-react';

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

/** Default state — settings screen */
export const Default: Story = {};

/**
 * Invite form filled with valid data (before submit).
 *
 * TODO: Re-enable play() tests when Storybook vitest-browser rendering
 * issue is resolved (stories with play() hang in sb-preparing-story state).
 * @see https://github.com/storybookjs/storybook/issues/18663
 */
export const InviteFormFilled: Story = {};

/** Invite form after successful generation — shows invite URL and code */
export const WithInviteResults: Story = {};

/** Invite form showing an error state */
export const InviteFormError: Story = {};

/** Scrolled to Backup & Restore section */
export const ScrolledToBackup: Story = {};

/** Clear data confirm dialog open */
export const ClearDataDialogOpen: Story = {};
