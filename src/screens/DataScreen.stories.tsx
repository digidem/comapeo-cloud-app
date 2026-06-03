import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { DataScreen } from './DataScreen';

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
}

const meta: Meta<DataScreenArgs> = {
  title: 'Screens/Data',
  component: DataScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    selectedProjectId: 'proj-1',
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
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
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

// Note: a "Loading" story is intentionally omitted. The screen renders a
// skeleton only when `projectsQuery.isPending` is true AND no project is
// selected; the mock hooks resolve immediately, so a `Loading` story would
// render the same UI as `NoProjectSelected`. A real loading state would
// require an MSW delay, which is out of scope here.

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
