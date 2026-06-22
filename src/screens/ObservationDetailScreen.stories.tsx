import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, within } from 'storybook/test';

import { createRoute } from '@tanstack/react-router';

import { useProjectStore } from '@/stores/project-store';

import { ObservationDetailScreen } from './ObservationDetailScreen';

// Standalone route without a parent. The Storybook framework's
// @storybook/tanstack-react decorator will supply a synthetic root at
// runtime via routerParameterRoute.update({ getParentRoute: ... }).
// getParentRoute is omitted to avoid attaching the route to a tree that
// would conflict with the framework's own route duplication logic.
/* eslint-disable @typescript-eslint/no-explicit-any */
const storyRoute = createRoute({
  path: '/data/observations/$observationId',
  component: ObservationDetailScreen,
} as any);
/* eslint-enable @typescript-eslint/no-explicit-any */

const meta: Meta<typeof ObservationDetailScreen> = {
  title: 'Screens/ObservationDetail',
  component: ObservationDetailScreen,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ObservationDetailScreen>;

/**
 * Story showing an observation with project context.
 *
 * Passes a standalone route to the Storybook TanStack Router decorator
 * so `useParams()` returns `{ observationId: 'obs-1' }`, which matches
 * MOCK_OBSERVATIONS from the Storybook hook mocks. The `play()` function
 * asserts the back-nav link is rendered and points to `/data`.
 */
export const WithObservation: Story = {
  decorators: [
    (Story) => {
      useProjectStore.setState({ selectedProjectId: 'proj-1' });
      return <Story />;
    },
  ],
  parameters: {
    tanstack: {
      router: {
        route: storyRoute,
        params: { observationId: 'obs-1' },
        path: '/data/observations/obs-1',
      },
    },
  },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    const backLink = await canvas.findByRole('link', { name: /data/i });
    await expect(backLink).toBeInTheDocument();
    await expect(backLink).toHaveAttribute('href', '/data');
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
