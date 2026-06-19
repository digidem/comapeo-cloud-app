import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Tooltip } from '@/components/ui/tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    side: {
      control: { type: 'select' },
      options: ['top', 'bottom', 'left', 'right'],
    },
  },
  args: {
    content: 'Tooltip text',
    side: 'top',
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

/** Default tooltip appearing above the trigger (forced open for screenshot) */
export const Default: Story = {
  args: { open: true },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Hover me
      </button>
    </Tooltip>
  ),
};

/** Tooltip appearing below the trigger (forced open for screenshot) */
export const Bottom: Story = {
  args: { side: 'bottom', open: true },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Hover me
      </button>
    </Tooltip>
  ),
};

/** Tooltip appearing to the left of the trigger (forced open for screenshot) */
export const Left: Story = {
  args: { side: 'left', open: true },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Hover me
      </button>
    </Tooltip>
  ),
};

/** Tooltip appearing to the right of the trigger (forced open for screenshot) */
export const Right: Story = {
  args: { side: 'right', open: true },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Hover me
      </button>
    </Tooltip>
  ),
};

/** Tooltip with multi-line content (forced open for screenshot) */
export const MultiLine: Story = {
  args: {
    content: 'This is a longer tooltip with more descriptive text for context.',
    side: 'top',
    open: true,
  },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Hover me
      </button>
    </Tooltip>
  ),
};

/** Always-open tooltip for static visual documentation and screenshots */
export const AlwaysOpen: Story = {
  args: {
    content: 'Always visible tooltip',
    side: 'top',
    open: true,
  },
  render: (args) => (
    <Tooltip {...args}>
      <button
        type="button"
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Static trigger
      </button>
    </Tooltip>
  ),
};
