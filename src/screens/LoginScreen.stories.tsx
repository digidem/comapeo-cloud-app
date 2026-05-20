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
