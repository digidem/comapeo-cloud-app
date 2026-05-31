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
      Object.assign(navigator, {
        clipboard: {
          writeText: async (_text: string) => {
            /* no-op */
          },
        },
      });
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof CopyButton>;

/** Default copy button with a URL */
export const Default: Story = {
  args: {
    text: 'https://example.com/invite/abc123',
  },
};

/** Short text content */
export const ShortText: Story = {
  args: {
    text: 'abc',
  },
};

/** Custom label and success label */
export const CustomLabels: Story = {
  args: {
    text: 'https://example.com/invite/abc123',
    label: 'Copy link',
    successLabel: 'Link copied!',
  },
};
