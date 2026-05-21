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

export const Connected: Story = {
  play: async () => {
    // InviteScreen manages its own state via useEffect.
    // The default story shows the "loading" state.
  },
};
