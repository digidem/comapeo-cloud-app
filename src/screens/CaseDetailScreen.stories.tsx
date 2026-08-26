import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { userEvent, within } from 'storybook/test';

import { createRoute } from '@tanstack/react-router';

import { useProjectStore } from '@/stores/project-store';

import { CaseDetailScreen } from './CaseDetailScreen';
import { useStorybookDataStore } from './stories/storybook-loading-control';

interface CaseDetailArgs {
  selectedProjectId: string | null;
  caseDetailDataMode: 'normal' | 'loading' | 'error' | 'not-found';
  caseDataMode: 'normal' | 'loading' | 'error' | 'empty';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const storyRoute = createRoute({
  path: '/cases/$caseId',
  component: CaseDetailScreen,
} as any);
/* eslint-enable @typescript-eslint/no-explicit-any */

const meta: Meta<CaseDetailArgs> = {
  title: 'Screens/CaseDetail',
  component: CaseDetailScreen,
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: storyRoute,
        params: { caseId: 'case-1' },
        path: '/cases/case-1',
      },
    },
  },
  args: {
    selectedProjectId: 'proj-1',
    caseDetailDataMode: 'normal',
    caseDataMode: 'normal',
  },
  decorators: [
    (Story, context) => {
      useProjectStore.setState({
        selectedProjectId: context.args.selectedProjectId,
      });
      useStorybookDataStore.setState({
        caseDetailDataMode: context.args.caseDetailDataMode,
        caseDataMode: context.args.caseDataMode,
      });
      return <Story />;
    },
  ],
  render: () => <CaseDetailScreen />,
};

export default meta;
type Story = StoryObj<CaseDetailArgs>;

export const Overview: Story = {};

export const Activity: Story = {
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const activityTab = await page.findByRole(
      'tab',
      { name: 'Activity' },
      { timeout: 5_000 },
    );
    await userEvent.click(activityTab);
  },
};

export const ReportState: Story = {
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const reportStateTab = await page.findByRole(
      'tab',
      { name: 'Report State' },
      { timeout: 5_000 },
    );
    await userEvent.click(reportStateTab);
  },
};

export const Loading: Story = {
  args: { caseDetailDataMode: 'loading' },
};

export const NotFound: Story = {
  args: { caseDetailDataMode: 'not-found' },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
