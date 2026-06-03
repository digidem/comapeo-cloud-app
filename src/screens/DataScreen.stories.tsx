import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { DataScreen } from './DataScreen';
import { useStorybookLoadingStore } from './stories/storybook-loading-control';

/**
 * Custom args for the Data screen stories.
 *
 * The screen itself reads the active project from the project store rather
 * than from props, so we expose `selectedProjectId` as a Storybook control
 * and sync it into the mock store via a shared decorator. This lets reviewers
 * flip between "no project" and the available fixture projects from the
 * Controls panel instead of editing the story source.
 */
interface DataScreenArgs {
  /** ID of the project to mark as selected in the mock project store. */
  selectedProjectId: string | null;
  /**
   * When true, the mock `useProjects` hook is held in a pending state so the
   * screen renders its loading skeleton (see issue #86).
   */
  loading: boolean;
}

const meta: Meta<DataScreenArgs> = {
  title: 'Screens/Data',
  component: DataScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    selectedProjectId: 'proj-1',
    loading: false,
  },
  argTypes: {
    selectedProjectId: {
      name: 'Selected project',
      description:
        'Project selected in the project store. `null` renders the empty state.',
      control: 'select',
      options: [null, 'proj-1', 'proj-2'],
      table: {
        type: { summary: 'string | null' },
        defaultValue: { summary: 'proj-1' },
      },
    },
    loading: {
      name: 'Loading',
      description:
        'When true, the mock `useProjects` hook is held pending so the screen renders its loading skeleton (see issue #86).',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useStorybookLoadingStore.setState({
        projectsPending: Boolean(context.args.loading),
      });
      return <Story />;
    },
  ],
  // The screen takes no props — render it directly so the `selectedProjectId`
  // arg drives the store (via the decorator) rather than being passed as a prop.
  render: () => <DataScreen />,
};

export default meta;
type Story = StoryObj<DataScreenArgs>;

export const NoProjectSelected: Story = {
  args: { selectedProjectId: null },
};

export const WithProjectAndData: Story = {
  args: { selectedProjectId: 'proj-1' },
};

// Note: a "Loading" story is intentionally omitted when no project is
// selected — the screen would render the empty state (skeleton only renders
// for a project query that is pending). With the `loading` control wired
// to the mock `useProjects` hook via the decorator, reviewers can flip
// any existing story into the loading state from the Controls panel and
// see the skeleton render in place of the project list.

export const WithProjectDesktop: Story = {
  args: { selectedProjectId: 'proj-1' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};

export const NoProjectDesktop: Story = {
  args: { selectedProjectId: null },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};
