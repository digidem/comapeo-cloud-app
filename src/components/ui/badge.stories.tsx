import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Badge, severityToVariant } from '@/components/ui/badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['info', 'high', 'medium', 'low', 'neutral'],
    },
  },
  args: {
    variant: 'info',
    children: 'Info',
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

/** Default info badge */
export const Default: Story = {
  args: {
    variant: 'info',
    children: 'Info',
  },
};

/** High severity — red styling */
export const High: Story = {
  args: {
    variant: 'high',
    children: 'High',
  },
};

/** Medium severity — amber styling */
export const Medium: Story = {
  args: {
    variant: 'medium',
    children: 'Medium',
  },
};

/** Low severity — blue styling */
export const Low: Story = {
  args: {
    variant: 'low',
    children: 'Low',
  },
};

/** Neutral — gray styling */
export const Neutral: Story = {
  args: {
    variant: 'neutral',
    children: 'Neutral',
  },
};

/** Unknown severity falls back to info variant via severityToVariant helper */
export const UnknownSeverity: Story = {
  render: () => <Badge variant={severityToVariant('unknown')}>Unknown</Badge>,
};
