import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';

const meta: Meta<typeof ObservationCategoryIcon> = {
  title: 'Components/ObservationCategoryIcon',
  component: ObservationCategoryIcon,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof ObservationCategoryIcon>;

export const FallbackLetter: Story = {
  args: {
    category: {
      id: 'water',
      name: 'Water Quality',
      color: '#1F6FFF',
    },
  },
};

export const NoColor: Story = {
  args: {
    category: {
      id: 'wildlife',
      name: 'Wildlife',
    },
  },
};

export const WithIconImage: Story = {
  args: {
    category: {
      id: 'forest',
      name: 'Forest Cover',
      color: '#04145C',
      iconUrl: 'https://example.com/forest-icon.png',
    },
  },
};
