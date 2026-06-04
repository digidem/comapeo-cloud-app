import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, waitFor, within } from 'storybook/test';

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
    await waitFor(
      () => {
        const prep = canvasElement.ownerDocument.querySelector(
          '.sb-preparing-story',
        );
        if (prep) throw new Error('story still preparing');
      },
      { timeout: 10_000 },
    );

    const canvas = within(canvasElement);
    const back = await canvas.findByRole('link', { name: /data/i });
    await expect(back).toBeInTheDocument();
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
