import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { InviteScreen } from './InviteScreen';

const meta: Meta<typeof InviteScreen> = {
  title: 'Screens/Invite',
  component: InviteScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof InviteScreen>;

export const Loading: Story = {};

/** Connected state — InviteScreen manages its own state via useEffect. */
export const Connected: Story = {};
