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
 * `dataMode` controls the mock data hooks for observations and alerts
 * (useObservations, useAlerts), while `projectDataMode` controls useProjects
 * independently.  This separation ensures that error / empty stories for the
 * data list still have a valid project in the store.
 *
 * Modes (both args accept the same values):
 *   - normal  (default): fixture data
 *   - loading: queries stay pending → loading skeleton renders
 *   - error  : queries reject → error state renders
 *   - empty  : queries return [] → empty state renders
 */
interface DataScreenArgs {
  /** ID of the project to mark as selected in the mock project store. */
  selectedProjectId: string | null;
  /** Data mode for observations / alerts (see useStorybookDataStore). */
  dataMode: 'normal' | 'loading' | 'error' | 'empty';
  /** Data mode for useProjects (defaults to 'normal'). */
  projectDataMode: 'normal' | 'loading' | 'error' | 'empty';
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
    projectDataMode: 'normal',
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
        'What the mock observation / alert hooks should return. Reviewers can flip any story into a loading / error / empty state from the Controls panel.',
      control: { type: 'select' },
      options: ['normal', 'loading', 'error', 'empty'],
      table: {
        type: { summary: 'normal | loading | error | empty' },
        defaultValue: { summary: 'normal' },
      },
    },
    projectDataMode: {
      name: 'Project data mode',
      description:
        'What the mock useProjects hook should return. Kept separate from dataMode so that error / empty data-list stories still have a valid project.',
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
        projectDataMode: context.args.projectDataMode,
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
  args: {
    selectedProjectId: null,
    dataMode: 'normal',
    projectDataMode: 'normal',
  },
};

export const WithProjectAndData: Story = {
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'normal',
    projectDataMode: 'normal',
  },
};

export const Loading: Story = {
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'loading',
    projectDataMode: 'normal',
  },
};

export const ErrorState: Story = {
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'error',
    projectDataMode: 'normal',
  },
};

export const Empty: Story = {
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'empty',
    projectDataMode: 'normal',
  },
};

export const WithProjectDesktop: Story = {
  args: {
    selectedProjectId: 'proj-1',
    dataMode: 'normal',
    projectDataMode: 'normal',
  },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};

export const NoProjectDesktop: Story = {
  args: {
    selectedProjectId: null,
    dataMode: 'normal',
    projectDataMode: 'normal',
  },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
};
