import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { MediaLightbox } from '@/components/shared/media-lightbox';

const meta: Meta<typeof MediaLightbox> = {
  title: 'Components/MediaLightbox',
  component: MediaLightbox,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof MediaLightbox>;

const noop = () => {};

const images = [
  'https://example.com/photo-1.jpg',
  'https://example.com/photo-2.jpg',
  'https://example.com/photo-3.jpg',
];

export const Single: Story = {
  args: {
    images: [images[0]!],
    currentIndex: 0,
    onClose: noop,
    onNavigate: noop,
  },
};

export const Multiple: Story = {
  args: {
    images,
    currentIndex: 1,
    onClose: noop,
    onNavigate: noop,
  },
};

export const LastImage: Story = {
  args: {
    images,
    currentIndex: 2,
    onClose: noop,
    onNavigate: noop,
  },
};
