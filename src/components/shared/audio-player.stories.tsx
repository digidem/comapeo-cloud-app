import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { AudioPlayer } from '@/components/shared/audio-player';

/**
 * AudioPlayer stories use mocked hooks that always return the "ready" state.
 * Loading and error states cannot be demonstrated without modifying the mock
 * per-story. If needed in the future, the mock could be enhanced to read from
 * a module-level variable or Zustand-like store.
 */
const meta: Meta<typeof AudioPlayer> = {
  title: 'Components/AudioPlayer',
  component: AudioPlayer,
  parameters: {
    layout: 'centered',
  },
  args: {
    driveId: 'drive-abc123',
    name: 'recording.mp3',
    projectId: 'project-xyz789',
  },
  decorators: [
    (Story) => {
      // Mock useAuthenticatedImageUrl hook to return immediate success state
      // This ensures the story doesn't make real network requests in Storybook
      jest.mock('@/hooks/useAuthenticatedImageUrl', () => ({
        useAuthenticatedImageUrl: () => ({
          blobUrl: 'https://example.com/mock-audio.mp3',
          isLoading: false,
          error: null,
        }),
      }));
      // Reset the mock module registry to ensure our mock is used
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const _mod = require('@/hooks/useAuthenticatedImageUrl');
      return <Story {...{}} />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof AudioPlayer>;

/** Default audio player with play button and progress bar */
export const Default: Story = {};

/** Audio player with an MP3 file */
export const MpegFormat: Story = {
  args: {
    driveId: 'drive-abc123',
    name: 'interview-recording.mp3',
    projectId: 'project-xyz789',
  },
};

/** Audio player with a WAV file */
export const WavFormat: Story = {
  args: {
    driveId: 'drive-abc123',
    name: 'bird-song.wav',
    projectId: 'project-xyz789',
  },
};

/** Audio player with an M4A file */
export const M4aFormat: Story = {
  args: {
    driveId: 'drive-abc123',
    name: 'meeting-notes.m4a',
    projectId: 'project-xyz789',
  },
};
