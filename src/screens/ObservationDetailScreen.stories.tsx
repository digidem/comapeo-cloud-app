import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { useProjectStore } from '@/stores/project-store';

import { ObservationDetailScreen } from './ObservationDetailScreen';

const meta: Meta<typeof ObservationDetailScreen> = {
  title: 'Screens/ObservationDetail',
  component: ObservationDetailScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ObservationDetailScreen>;

export const WithObservation: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    // The component loads data via useObservations() which requires MSW.
    // In Storybook without MSW, it renders the loading skeleton state.
    // We verify the component mounted by checking for skeleton placeholders.
    // Skeleton components render div elements with animate-pulse class
    const skeletonElements = canvasElement.querySelectorAll('.animate-pulse');
    await expect(skeletonElements.length).toBeGreaterThan(0);
  },
};

export const NoProject: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: null });
      return <Story />;
    },
  ],
};
