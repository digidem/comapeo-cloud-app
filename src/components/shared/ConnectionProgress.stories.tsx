import type { Meta, StoryObj } from '@storybook/tanstack-react';

import {
  ConnectionProgress,
  type ConnectionStep,
} from '@/components/shared/ConnectionProgress';

const meta: Meta<typeof ConnectionProgress> = {
  title: 'Components/ConnectionProgress',
  component: ConnectionProgress,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ConnectionProgress>;

const BASE_STEPS: ConnectionStep[] = [
  { id: 'verify', label: 'Verifying invite...', status: 'pending' },
  { id: 'connect', label: 'Connecting to server...', status: 'pending' },
  { id: 'sync', label: 'Syncing data...', status: 'pending' },
  { id: 'prepare', label: 'Preparing dashboard...', status: 'pending' },
];

export const AllPending: Story = {
  args: {
    steps: BASE_STEPS,
    heading: 'Connecting to archive...',
  },
};

export const Step1Active: Story = {
  args: {
    steps: [
      { ...BASE_STEPS[0]!, status: 'active' },
      BASE_STEPS[1]!,
      BASE_STEPS[2]!,
      BASE_STEPS[3]!,
    ],
    heading: 'Connecting to archive...',
  },
};

export const Step1CompleteStep2Active: Story = {
  args: {
    steps: [
      { ...BASE_STEPS[0]!, status: 'completed' },
      { ...BASE_STEPS[1]!, status: 'active' },
      BASE_STEPS[2]!,
      BASE_STEPS[3]!,
    ],
    heading: 'Connecting to archive...',
  },
};

export const Step3Active: Story = {
  args: {
    steps: [
      { ...BASE_STEPS[0]!, status: 'completed' },
      { ...BASE_STEPS[1]!, status: 'completed' },
      { ...BASE_STEPS[2]!, status: 'active' },
      BASE_STEPS[3]!,
    ],
    heading: 'Connecting to archive...',
  },
};

export const Success: Story = {
  args: {
    steps: BASE_STEPS.map((s) => ({ ...s, status: 'completed' as const })),
    isComplete: true,
  },
};

export const Step1Error: Story = {
  args: {
    steps: [
      { ...BASE_STEPS[0]!, status: 'error' },
      BASE_STEPS[1]!,
      BASE_STEPS[2]!,
      BASE_STEPS[3]!,
    ],
    heading: 'Connecting to archive...',
  },
};
