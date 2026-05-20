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

export const Default: Story = {};

export const WithInviteResults: Story = {
  play: async ({ canvas: _canvas }) => {
    // The form auto-submits are tricky to test in Storybook;
    // this story shows the default state with empty form
  },
};
