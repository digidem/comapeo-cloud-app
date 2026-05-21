import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { MediaLightbox } from '@/components/shared/media-lightbox';

vi.mock('@/hooks/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: vi.fn(() => ({
    blobUrl: 'blob:test',
    isLoading: false,
    error: null,
  })),
}));

const images = [
  'https://example.com/photo-1.jpg',
  'https://example.com/photo-2.jpg',
];

describe('MediaLightbox', () => {
  it('renders the current image', () => {
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    const img = screen.getByRole('img', { name: /Photo 1/i });
    expect(img).toBeInTheDocument();
  });

  it('shows image counter when multiple images', () => {
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('does not show counter for single image', () => {
    render(
      <MediaLightbox
        images={['https://example.com/only.jpg']}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={onClose}
        onNavigate={() => {}}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /close preview/i }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onNavigate with next index when next button is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /next image/i }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('calls onNavigate with previous index when prev button is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <MediaLightbox
        images={images}
        currentIndex={1}
        onClose={() => {}}
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /previous image/i }),
    );
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('hides prev button on first image', () => {
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /previous image/i }),
    ).not.toBeInTheDocument();
  });

  it('hides next button on last image', () => {
    render(
      <MediaLightbox
        images={images}
        currentIndex={1}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /next image/i }),
    ).not.toBeInTheDocument();
  });

  it('has correct aria role and modal attribute', () => {
    render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
