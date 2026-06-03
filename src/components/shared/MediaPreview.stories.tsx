import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { MediaPreview } from '@/components/shared/MediaPreview';

const meta: Meta<typeof MediaPreview> = {
  title: 'Components/MediaPreview',
  component: MediaPreview,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof MediaPreview>;

const photoUrls = [
  'https://example.com/photo-1.jpg',
  'https://example.com/photo-2.jpg',
  'https://example.com/photo-3.jpg',
];

export const Default: Story = {
  args: {
    observationLocalId: 'obs-1',
    tags: { photoUrls: photoUrls.join(',') },
  },
};

export const SinglePhoto: Story = {
  args: {
    observationLocalId: 'obs-2',
    tags: { photoUrls: photoUrls[0]! },
  },
};

export const WithAudio: Story = {
  args: {
    observationLocalId: 'obs-3',
    tags: { photoUrls: photoUrls.slice(0, 2).join(','), audioCount: '1' },
  },
};

export const ManyPhotos: Story = {
  args: {
    observationLocalId: 'obs-4',
    tags: {
      photoUrls: [
        ...photoUrls,
        'https://example.com/photo-4.jpg',
        'https://example.com/photo-5.jpg',
      ].join(','),
    },
  },
};
