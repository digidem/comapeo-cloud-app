import type { Meta, StoryObj } from '@storybook/tanstack-react';

import type { SavedMap } from '@/lib/db';

import {
  type SmpPreviewDependencies,
  SmpPreviewDialog,
} from './SmpPreviewDialog';

const map: SavedMap = {
  id: 'storybook-preview-map',
  projectLocalId: 'storybook-project',
  name: 'Community territory map',
  type: 'style',
  styleUrl: '',
  bbox: [-70, -5, -60, 2],
  minZoom: 0,
  maxZoom: 14,
  status: 'ready',
  smpBlob: new Blob(['storybook']),
  smpSize: 9,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

const dependencies: SmpPreviewDependencies = {
  registerProtocol() {},
  getReader: async () =>
    ({}) as Awaited<ReturnType<SmpPreviewDependencies['getReader']>>,
  resolveStyle: async () => ({ version: 8, sources: {}, layers: [] }),
  closeReader: async () => {},
};

const meta = {
  title: 'Map/SmpPreviewDialog',
  component: SmpPreviewDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: () => {},
    map,
    dependencies,
  },
} satisfies Meta<typeof SmpPreviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
