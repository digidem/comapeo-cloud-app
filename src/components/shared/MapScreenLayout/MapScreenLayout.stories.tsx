import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { MapScreenLayout } from '@/components/shared/MapScreenLayout/MapScreenLayout';

const meta: Meta<typeof MapScreenLayout> = {
  title: 'Components/MapScreenLayout',
  component: MapScreenLayout,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: 600 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MapScreenLayout>;

export const Default: Story = {
  args: {},
};

export const WithTopRight: Story = {
  args: {
    topRight: (
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-button bg-surface-card text-text-muted hover:bg-surface-container-low hover:text-text transition-colors"
        aria-label="Grid view"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>
    ),
  },
};

export const WithBottomButtons: Story = {
  args: {
    bottomLeft: (
      <button
        type="button"
        className="rounded-button bg-surface-card px-4 py-2 text-sm shadow-card"
      >
        Filters
      </button>
    ),
    bottomRight: (
      <button
        type="button"
        className="rounded-button bg-primary px-4 py-2 text-sm text-white shadow-card"
      >
        Export
      </button>
    ),
  },
};

export const WithSidebar: Story = {
  args: {
    sidebar: (
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Sidebar</h2>
        <p className="text-xs text-text-muted">Desktop sidebar content</p>
      </div>
    ),
  },
};

export const NonInteractive: Story = {
  args: {},
};
