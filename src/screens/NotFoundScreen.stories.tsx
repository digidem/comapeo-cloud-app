import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { NotFoundScreen } from './NotFoundScreen';

const meta: Meta<typeof NotFoundScreen> = {
  title: 'Screens/NotFound',
  component: NotFoundScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof NotFoundScreen>;

export const Default: Story = {};
