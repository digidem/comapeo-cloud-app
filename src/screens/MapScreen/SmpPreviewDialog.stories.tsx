import type { Meta, StoryObj } from '@storybook/tanstack-react';

import type { SavedMap } from '@/lib/db';

import { SmpPreviewDialog } from './SmpPreviewDialog';

// Minimal valid SMP archive: VERSION + an empty style.json. Keeping the story
// on the real reader path prevents Storybook-only dependency injection from
// drifting away from production preview behaviour.
const SYNTHETIC_SMP_BASE64 =
  'UEsDBBQAAAAAAAAAIVA1bzb3AwAAAAMAAAAHAAAAVkVSU0lPTjEuMFBLAwQUAAAAAAAAACFQ0P8cE08AAABPAAAACgAAAHN0eWxlLmpzb257InZlcnNpb24iOjgsInNvdXJjZXMiOnt9LCJsYXllcnMiOltdLCJtZXRhZGF0YSI6eyJzbXA6Ym91bmRzIjpbLTcwLC01LC02MCwyXX19UEsBAhQDFAAAAAAAAAAhUDVvNvcDAAAAAwAAAAcAAAAAAAAAAAAAAIABAAAAAFZFUlNJT05QSwECFAMUAAAAAAAAACFQ0P8cE08AAABPAAAACgAAAAAAAAAAAAAAgAEoAAAAc3R5bGUuanNvblBLBQYAAAAAAgACAG0AAACfAAAAAAA=';

function blobFromBase64(encoded: string): Blob {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/zip' });
}

const smpBlob = blobFromBase64(SYNTHETIC_SMP_BASE64);

const map: SavedMap = {
  id: 'storybook-preview-map',
  projectLocalId: 'storybook-project',
  name: 'Community territory map',
  type: 'style',
  origin: 'imported',
  styleUrl: '',
  bbox: [-70, -5, -60, 2],
  minZoom: 0,
  maxZoom: 14,
  status: 'ready',
  smpBlob,
  smpSize: smpBlob.size,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

const meta = {
  title: 'Map/SmpPreviewDialog',
  component: SmpPreviewDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: () => {},
    map,
  },
} satisfies Meta<typeof SmpPreviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
