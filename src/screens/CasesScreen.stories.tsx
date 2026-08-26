import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useProjectStore } from '@/stores/project-store';

import { CasesScreen } from './CasesScreen';
import { useStorybookDataStore } from './stories/storybook-loading-control';

interface CasesScreenArgs {
  selectedProjectId: string | null;
  caseDataMode: 'normal' | 'loading' | 'error' | 'empty';
  projectDataMode: 'normal' | 'loading' | 'error' | 'empty';
  caseStorageState:
    'persisted' | 'denied' | 'unsupported' | 'error' | 'quota-risk';
}

const meta: Meta<CasesScreenArgs> = {
  title: 'Screens/Cases',
  component: CasesScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    selectedProjectId: 'proj-1',
    caseDataMode: 'normal',
    projectDataMode: 'normal',
    caseStorageState: 'persisted',
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useStorybookDataStore.setState({
        caseDataMode: context.args.caseDataMode,
        projectDataMode: context.args.projectDataMode,
        caseStorageState: context.args.caseStorageState,
      });
      return <Story />;
    },
  ],
  render: () => <CasesScreen />,
};

export default meta;
type Story = StoryObj<CasesScreenArgs>;

export const WithCases: Story = {};

export const Empty: Story = {
  args: { caseDataMode: 'empty' },
};

export const Loading: Story = {
  args: { caseDataMode: 'loading' },
};

export const StorageRiskDenied: Story = {
  args: { caseStorageState: 'denied' },
};

export const StorageQuotaRisk: Story = {
  args: { caseStorageState: 'quota-risk' },
};

export const NoProject: Story = {
  args: { selectedProjectId: null },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
