import { screen } from '@tests/mocks/test-utils';
import { render } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { MediaPreview } from '@/components/shared/MediaPreview';

// Mock AuthImg to avoid needing useAuthenticatedImageUrl
vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="auth-img" src={src} alt={alt} />
  ),
}));

// Mock @tanstack/react-router Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to} data-testid="link">
      {children}
    </a>
  ),
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
}));

describe('MediaPreview', () => {
  it('renders nothing when tags have no photoUrls or audioCount', () => {
    const { container } = render(
      <MediaPreview observationLocalId="obs-1" tags={{ category: 'forest' }} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when tags are undefined', () => {
    const { container } = render(<MediaPreview observationLocalId="obs-1" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders 1 thumbnail when 1 photo URL', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{ photoUrls: 'https://example.com/photo1.jpg' }}
      />,
    );
    const imgs = screen.getAllByTestId('auth-img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://example.com/photo1.jpg');
  });

  it('renders first-class attachment thumbnails before legacy tag URLs', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{ photoUrls: 'https://example.com/legacy.jpg' }}
        attachments={[
          {
            localId: 'att-1',
            projectLocalId: 'proj-1',
            observationLocalId: 'obs-1',
            sourceType: 'remoteArchive',
            sourceId: 'server-1',
            resolvedUrl: 'https://archive.example.com/photo.jpg',
            mediaType: 'photo',
            createdAt: '',
            updatedAt: '',
            dirtyLocal: false,
            deleted: false,
          },
        ]}
      />,
    );
    const imgs = screen.getAllByTestId('auth-img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute(
      'src',
      'https://archive.example.com/photo.jpg',
    );
  });

  it('renders audio icon from first-class audio attachments without tags', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        attachments={[
          {
            localId: 'att-1',
            projectLocalId: 'proj-1',
            observationLocalId: 'obs-1',
            sourceType: 'remoteArchive',
            sourceId: 'server-1',
            mediaType: 'audio',
            createdAt: '',
            updatedAt: '',
            dirtyLocal: false,
            deleted: false,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('audio-icon')).toBeInTheDocument();
  });

  it('renders 2 thumbnails when 2 photo URLs', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{
          photoUrls:
            'https://example.com/photo1.jpg,https://example.com/photo2.jpg',
        }}
      />,
    );
    const imgs = screen.getAllByTestId('auth-img');
    expect(imgs).toHaveLength(2);
  });

  it('renders "+N more" text when total media exceeds 2', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{
          photoUrls:
            'https://example.com/photo1.jpg,https://example.com/photo2.jpg,https://example.com/photo3.jpg',
        }}
      />,
    );
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('renders "+N more" with correct count including audio', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{
          photoUrls:
            'https://example.com/photo1.jpg,https://example.com/photo2.jpg',
          photoCount: '2',
          audioCount: '3',
        }}
      />,
    );
    // 2 photos + 3 audio = 5 total, showing 2 photos → +3 more
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('renders audio icon placeholder when audioCount > 0 and no photos', () => {
    render(
      <MediaPreview observationLocalId="obs-1" tags={{ audioCount: '2' }} />,
    );
    expect(screen.getByTestId('audio-icon')).toBeInTheDocument();
  });

  it('renders audio icon alongside photos when both present', () => {
    render(
      <MediaPreview
        observationLocalId="obs-1"
        tags={{
          photoUrls: 'https://example.com/photo1.jpg',
          photoCount: '1',
          audioCount: '1',
        }}
      />,
    );
    expect(screen.getAllByTestId('auth-img')).toHaveLength(1);
    expect(screen.getByTestId('audio-icon')).toBeInTheDocument();
  });

  // --- Edge case tests (from external review findings) ---

  describe('edge cases', () => {
    it('filters out empty strings from photoUrls with trailing comma', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{ photoUrls: 'https://example.com/photo1.jpg,' }}
        />,
      );
      const imgs = screen.getAllByTestId('auth-img');
      expect(imgs).toHaveLength(1);
      expect(imgs[0]).toHaveAttribute('src', 'https://example.com/photo1.jpg');
    });

    it('filters out empty strings from photoUrls with consecutive commas', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{
            photoUrls:
              'https://example.com/photo1.jpg,,https://example.com/photo2.jpg',
          }}
        />,
      );
      const imgs = screen.getAllByTestId('auth-img');
      expect(imgs).toHaveLength(2);
    });

    it('trims photo URLs and ignores whitespace-only entries', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{
            photoUrls:
              ' https://example.com/photo1.jpg ,   , https://example.com/photo2.jpg ',
          }}
        />,
      );
      const imgs = screen.getAllByTestId('auth-img');
      expect(imgs).toHaveLength(2);
      expect(imgs[0]).toHaveAttribute('src', 'https://example.com/photo1.jpg');
      expect(imgs[1]).toHaveAttribute('src', 'https://example.com/photo2.jpg');
    });

    it('renders nothing when photoUrls is an empty string', () => {
      const { container } = render(
        <MediaPreview observationLocalId="obs-1" tags={{ photoUrls: '' }} />,
      );
      expect(container.innerHTML).toBe('');
    });

    it('handles non-numeric audioCount gracefully', () => {
      const { container } = render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{ audioCount: 'abc' }}
        />,
      );
      // Number('abc') is NaN — component should handle gracefully
      // Should not crash; renders nothing or renders safely
      expect(container.innerHTML).toBeDefined();
    });

    it('ignores negative audioCount values', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{
            photoUrls: 'https://example.com/photo1.jpg',
            audioCount: '-1',
          }}
        />,
      );
      expect(screen.getAllByTestId('auth-img')).toHaveLength(1);
      expect(screen.queryByTestId('audio-icon')).not.toBeInTheDocument();
    });

    it('rounds fractional audioCount values down', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{
            photoUrls:
              'https://example.com/photo1.jpg,https://example.com/photo2.jpg',
            audioCount: '1.9',
          }}
        />,
      );
      expect(screen.getByText('+1 more')).toBeInTheDocument();
    });
  });

  // --- Accessibility tests ---

  describe('accessibility', () => {
    it('audio icon has role="img" for screen readers', () => {
      render(
        <MediaPreview observationLocalId="obs-1" tags={{ audioCount: '1' }} />,
      );
      const audioIcon = screen.getByTestId('audio-icon');
      expect(audioIcon).toHaveAttribute('role', 'img');
    });

    it('"+N more" span has aria-label with context', () => {
      render(
        <MediaPreview
          observationLocalId="obs-1"
          tags={{
            photoUrls:
              'https://example.com/photo1.jpg,https://example.com/photo2.jpg,https://example.com/photo3.jpg',
          }}
        />,
      );
      const moreText = screen.getByText('+1 more');
      expect(moreText).toHaveAttribute('aria-label');
      expect(moreText.getAttribute('aria-label')).toContain('1');
    });
  });
});
