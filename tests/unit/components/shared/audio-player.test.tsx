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
});
