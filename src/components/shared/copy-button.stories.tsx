import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { CopyButton } from '@/components/shared/copy-button';

const meta: Meta<typeof CopyButton> = {
  title: 'Components/CopyButton',
  component: CopyButton,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    text: {
      control: { type: 'text' },
    },
    label: {
      control: { type: 'text' },
    },
    successLabel: {
      control: { type: 'text' },
    },
  },
  decorators: [
    (Story) => {
      // Stub clipboard API — unavailable in cross-origin iframes (Storybook)
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (_text: string) => {
            /* no-op */
          },
        },
        configurable: true,
        writable: true,
      });
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof CopyButton>;

/** Default copy button with a URL displayed above */
export const Default: Story = {
  args: {
    text: 'https://example.com/invite/abc123',
  },
  render: (args) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <code
        style={{
          fontSize: 13,
          color: '#172033',
          background: '#F4F6FA',
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        {args.text}
      </code>
      <CopyButton {...args} />
    </div>
  ),
};

/** Short text content displayed above */
export const ShortText: Story = {
  args: {
    text: 'abc',
  },
  render: (args) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <code
        style={{
          fontSize: 13,
          color: '#172033',
          background: '#F4F6FA',
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        {args.text}
      </code>
      <CopyButton {...args} />
    </div>
  ),
};

/** Custom label and success label displayed with URL */
export const CustomLabels: Story = {
  args: {
    text: 'https://example.com/invite/abc123',
    label: 'Copy link',
    successLabel: 'Link copied!',
  },
  render: (args) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <code
        style={{
          fontSize: 13,
          color: '#172033',
          background: '#F4F6FA',
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        {args.text}
      </code>
      <CopyButton {...args} />
    </div>
  ),
};
