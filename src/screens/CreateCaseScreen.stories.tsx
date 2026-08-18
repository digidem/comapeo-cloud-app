import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { CreateCaseScreen } from './CreateCaseScreen';
import { useStorybookDataStore } from './stories/storybook-loading-control';

interface CreateCaseScreenArgs {
  selectedProjectId: string | null;
  projectDataMode: 'normal' | 'loading' | 'error' | 'empty';
}

const meta: Meta<CreateCaseScreenArgs> = {
  title: 'Screens/CreateCase',
  component: CreateCaseScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    selectedProjectId: 'proj-1',
    projectDataMode: 'normal',
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useStorybookDataStore.setState({
        projectDataMode: context.args.projectDataMode,
      });
      return <Story />;
    },
  ],
  render: () => <CreateCaseScreen />,
};

export default meta;
type Story = StoryObj<CreateCaseScreenArgs>;

export const WithProject: Story = {};

export const Loading: Story = {
  args: { projectDataMode: 'loading' },
};

export const NoProject: Story = {
  args: { selectedProjectId: null },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
