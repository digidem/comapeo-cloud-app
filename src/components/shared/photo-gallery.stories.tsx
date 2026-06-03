import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { PhotoGallery } from '@/components/shared/photo-gallery';

const meta: Meta<typeof PhotoGallery> = {
  title: 'Components/PhotoGallery',
  component: PhotoGallery,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof PhotoGallery>;

const photos = [
  { driveId: 'drive-1', name: 'river.jpg', type: 'image/jpeg' },
  { driveId: 'drive-2', name: 'forest.jpg', type: 'image/jpeg' },
  { driveId: 'drive-3', name: 'wildlife.jpg', type: 'image/jpeg' },
  { driveId: 'drive-4', name: 'soil.jpg', type: 'image/jpeg' },
];

export const Default: Story = {
  args: {
    photos,
    projectId: 'project-1',
  },
};

export const SinglePhoto: Story = {
  args: {
    photos: [photos[0]!],
    projectId: 'project-1',
  },
};

export const Empty: Story = {
  args: {
    photos: [],
    projectId: 'project-1',
  },
};
