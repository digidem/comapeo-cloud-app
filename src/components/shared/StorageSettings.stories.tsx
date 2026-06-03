import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { StorageSettings } from '@/components/shared/StorageSettings';

const meta: Meta<typeof StorageSettings> = {
  title: 'Components/StorageSettings',
  component: StorageSettings,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof StorageSettings>;

export const Default: Story = {};
