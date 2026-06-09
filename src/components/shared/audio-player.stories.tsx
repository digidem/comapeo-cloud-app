import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { AudioPlayer } from '@/components/shared/audio-player';

/**
 * AudioPlayer stories use mocked hooks that always return the "ready" state.
 * Loading and error states cannot be demonstrated without modifying the mock
 * per-story. If needed in the future, the mock could be enhanced to read from
 * a module-level variable or Zustand-like store.
 *
 * NOTE: All four format variants (Default, MpegFormat, WavFormat, M4aFormat)
 * render byte-identical screenshots because the `name` prop only affects the
 * MIME type passed to the mocked `getAttachmentUrl`. The mock always returns
 * the same blob URL, so the player visually renders identically regardless of
 * file format. This is intentional — the stories verify the component accepts
 * different file types without error, not that it looks different.
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
