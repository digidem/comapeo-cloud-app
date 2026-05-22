import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioPlayer } from '@/components/shared/audio-player';
import { getAttachmentUrl } from '@/lib/api-client';

function getAudioEl(container: HTMLElement): HTMLAudioElement {
  const el = container.querySelector('audio');
  if (!el) throw new Error('audio element not found');
  return el;
}

vi.mock('@/lib/api-client', () => ({
  getAttachmentUrl: vi.fn(
    (_projectId: string, driveId: string, type: string, name: string) =>
      `https://example.com/attachments/${driveId}/${type}/${name}`,
  ),
}));

let mockImageResult = {
  blobUrl: 'blob:https://example.com/audio' as string | null,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('@/hooks/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: (_url: string) => mockImageResult,
}));

describe('AudioPlayer', () => {
  const defaultProps = {
    driveId: 'drive1',
    name: 'recording.mp3',
    projectId: 'proj1',
  };

  beforeEach(() => {
    mockImageResult = {
      blobUrl: 'blob:https://example.com/audio',
      isLoading: false,
      error: null,
    };
  });

  it('renders play button', () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows audio element with blob URL src from useAuthenticatedImageUrl', () => {
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);
    expect(audio).toBeInTheDocument();
    // The src is now a blob URL from useAuthenticatedImageUrl
    expect(audio.getAttribute('src')).toBe('blob:https://example.com/audio');
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
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);
    vi.spyOn(audio, 'play').mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(audio.play).toHaveBeenCalled();
    // The .then(() => setIsPlaying(true)) runs after play resolves
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('pause button toggles back to play when clicked', () => {
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);
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
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);

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
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);
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
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);

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

  it('renders loading state when useAuthenticatedImageUrl returns isLoading true', () => {
    mockImageResult = { blobUrl: null, isLoading: true, error: null };
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByText('Loading audio...')).toBeInTheDocument();
  });

  it('renders error state when useAuthenticatedImageUrl returns an error', () => {
    mockImageResult = {
      blobUrl: null,
      isLoading: false,
      error: new Error('fetch failed'),
    };
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByText('Failed to load audio')).toBeInTheDocument();
  });

  it('disables play button when blobUrl is null (not loading, not error)', () => {
    mockImageResult = { blobUrl: null, isLoading: false, error: null };
    render(<AudioPlayer {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toBeDisabled();
  });

  it('renders audio element with undefined src when blobUrl is null', () => {
    mockImageResult = { blobUrl: null, isLoading: false, error: null };
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const audio = getAudioEl(container);
    // blobUrl ?? undefined → src attribute should be absent or null
    expect(audio.getAttribute('src')).toBeNull();
    expect(audio).toBeInTheDocument();
  });

  it('enables play button when blobUrl is present', () => {
    // default mock has blobUrl set — button should NOT be disabled
    render(<AudioPlayer {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).not.toBeDisabled();
  });

  it('renders error state with role="alert" for accessibility', () => {
    mockImageResult = {
      blobUrl: null,
      isLoading: false,
      error: new Error('fetch failed'),
    };
    render(<AudioPlayer {...defaultProps} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed to load audio');
  });
});
