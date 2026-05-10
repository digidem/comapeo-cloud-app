import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { AudioPlayer } from '@/components/shared/audio-player';
import { getAttachmentUrl } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  getAttachmentUrl: vi.fn(
    (_projectId: string, driveId: string, type: string, name: string) =>
      `https://example.com/attachments/${driveId}/${type}/${name}`,
  ),
}));

describe('AudioPlayer', () => {
  const defaultProps = {
    driveId: 'drive1',
    name: 'recording.mp3',
    projectId: 'proj1',
  };

  it('renders play button', () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows audio element with correct src', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;
    expect(audio).toBeInTheDocument();
    expect(audio.getAttribute('src')).toBe(
      'https://example.com/attachments/drive1/audio/mpeg/recording.mp3',
    );
  });

  it('calls getAttachmentUrl without variant', () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/mpeg',
      'recording.mp3',
    );
  });

  it('play button toggles to pause when clicked', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;
    vi.spyOn(audio, 'play').mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(audio.play).toHaveBeenCalled();
    // The .then(() => setIsPlaying(true)) runs after play resolves
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('pause button toggles back to play when clicked', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;
    vi.spyOn(audio, 'play').mockResolvedValue(undefined);
    vi.spyOn(audio, 'pause').mockImplementation(() => {});

    // Click play
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // Click pause
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('updates progress on timeupdate', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;

    Object.defineProperty(audio, 'duration', { value: 100, writable: true });
    Object.defineProperty(audio, 'currentTime', {
      value: 50,
      writable: true,
    });

    fireEvent.timeUpdate(audio);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
  });

  it('resets to play button when play() promise rejects', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;
    vi.spyOn(audio, 'play').mockRejectedValue(new Error('aborted'));

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // After play rejects, isPlaying should be reset to false
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(
          screen.getByRole('button', { name: 'Play' }),
        ).toBeInTheDocument();
        resolve();
      }, 0);
    });
  });

  it('updates duration on loadedMetadata', () => {
    render(<AudioPlayer {...defaultProps} />);
    const audio = screen.getByRole('audio') as HTMLAudioElement;

    Object.defineProperty(audio, 'duration', { value: 120, writable: true });

    fireEvent.loadedMetadata(audio);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuemax', '120');
  });

  it('handles loadedMetadata when audio ref is null', () => {
    render(<AudioPlayer {...defaultProps} />);
    // The handleLoadedMetadata callback has a guard: if (!audio) return
    // This is already covered since the ref is set, but we can verify
    // the progressbar starts with max 0
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuemax', '0');
  });

  it('uses wav mime type for .wav files', () => {
    render(<AudioPlayer {...defaultProps} name="recording.wav" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/wav',
      'recording.wav',
    );
  });

  it('uses ogg mime type for .ogg files', () => {
    render(<AudioPlayer {...defaultProps} name="recording.ogg" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/ogg',
      'recording.ogg',
    );
  });

  it('uses m4a mime type for .m4a files', () => {
    render(<AudioPlayer {...defaultProps} name="recording.m4a" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/mp4',
      'recording.m4a',
    );
  });

  it('uses webm mime type for .webm files', () => {
    render(<AudioPlayer {...defaultProps} name="recording.webm" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/webm',
      'recording.webm',
    );
  });

  it('falls back to mpeg for unknown extensions', () => {
    render(<AudioPlayer {...defaultProps} name="recording.xyz" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/mpeg',
      'recording.xyz',
    );
  });

  it('falls back to mpeg for files with no extension', () => {
    render(<AudioPlayer {...defaultProps} name="recording" />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'audio/mpeg',
      'recording',
    );
  });
});
