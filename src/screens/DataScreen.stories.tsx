import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useEffect } from 'react';

import { useProjectStore } from '@/stores/project-store';

import { DataScreen } from './DataScreen';
import { useStorybookDataStore } from './stories/storybook-loading-control';

/**
 * Custom args for the Data screen stories.
 *
 * The screen itself reads the active project from the project store rather
 * than from props, so we expose `selectedProjectId` as a Storybook control
 * and sync it into the mock store via a shared decorator. This lets reviewers
 * flip between "no project" and the available fixture projects from the
 * Controls panel instead of editing the story source.
 *
 * `dataMode` is a separate control that drives the mock data hooks
 * (useProjects, useObservations, useAlerts) into a particular state:
 *   - normal  (default): fixture data — observations, alerts, projects
 *   - loading: queries stay pending → loading skeleton renders
 *   - error  : queries reject → error state renders
 *   - empty  : queries return [] → empty state renders
 */
interface DataScreenArgs {
  /** ID of the project to mark as selected in the mock project store. */
  selectedProjectId: string | null;
  /** Data mode passed to the mock hooks (see useStorybookDataStore). */
  dataMode: 'normal' | 'loading' | 'error' | 'empty';
}

const meta: Meta<DataScreenArgs> = {
  title: 'Screens/Data',
  component: DataScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'normal',
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
    dataMode: {
      name: 'Data mode',
      description:
        'What the mock data hooks should return. Reviewers can flip any story into a loading / error / empty state from the Controls panel.',
      control: { type: 'select' },
      options: ['normal', 'loading', 'error', 'empty'],
      table: {
        type: { summary: 'normal | loading | error | empty' },
        defaultValue: { summary: 'normal' },
      },
    },
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useStorybookDataStore.setState({
        dataMode: context.args.dataMode,
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
  args: { selectedProjectId: null, dataMode: 'normal' },
};

export const WithProjectAndData: Story = {
  args: { selectedProjectId: 'proj-1', dataMode: 'normal' },
};

export const Loading: Story = {
  args: { selectedProjectId: 'proj-1', dataMode: 'loading' },
};

export const ErrorState: Story = {
  args: { selectedProjectId: 'proj-1', dataMode: 'error' },
};

export const Empty: Story = {
  args: { selectedProjectId: 'proj-1', dataMode: 'empty' },
};

export const WithProjectDesktop: Story = {
  args: { selectedProjectId: 'proj-1', dataMode: 'normal' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};

export const NoProjectDesktop: Story = {
  args: { selectedProjectId: null, dataMode: 'normal' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};
