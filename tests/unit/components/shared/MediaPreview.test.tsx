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
});
