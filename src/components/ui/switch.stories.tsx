import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useState } from 'react';

import { Switch } from '@/components/ui/switch';

const meta: Meta<typeof Switch> = {
  title: 'Components/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    checked: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

/** Default unchecked switch */
export const Default: Story = {
  args: {
    checked: false,
  },
};

/** Checked switch */
export const Checked: Story = {
  args: {
    checked: true,
  },
};

/** Disabled switch — cannot be toggled */
export const Disabled: Story = {
  args: {
    disabled: true,
    checked: false,
  },
};

/** Switch with a clickable label */
export const WithLabel: Story = {
  args: {
    label: 'Enable notifications',
    id: 'switch-label',
  },
};

/** Disabled switch in checked state */
export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
  },
};

/** Interactive switch that can be toggled via click */
export const Interactive: Story = {
  render: function InteractiveSwitch() {
    const [checked, setChecked] = useState(false);
    return (
      <Switch
        checked={checked}
        onCheckedChange={setChecked}
        label={checked ? 'Enabled' : 'Disabled'}
        id="interactive-switch"
      />
    );
  },
};
