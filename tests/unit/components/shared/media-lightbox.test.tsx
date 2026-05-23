import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    document.body.style.overflow = '';
  });

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

  it('locks body scrolling while open and restores it on unmount', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <MediaLightbox
        images={images}
        currentIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('auto');
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  describe('keyboard navigation', () => {
    it('pressing ArrowRight calls onNavigate with next index', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'ArrowRight' });
      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('pressing ArrowLeft calls onNavigate with previous index', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={1}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('pressing ArrowRight at last image does not call onNavigate', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={1}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'ArrowRight' });
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('pressing ArrowLeft at first image does not call onNavigate', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('pressing Escape calls onClose', () => {
      const onClose = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={onClose}
          onNavigate={() => {}}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('single-image lightbox does not navigate on arrow keys', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={['https://example.com/only.jpg']}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
      fireEvent.keyDown(dialog, { key: 'ArrowRight' });
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Touch / swipe navigation
  // ---------------------------------------------------------------------------

  describe('touch / swipe navigation', () => {
    it('swipe left (deltaX < -50) calls onNavigate with next index', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.touchStart(dialog, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100 }] });
      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('swipe right (deltaX > 50) calls onNavigate with previous index', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={1}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.touchStart(dialog, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 200 }] });
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('swipe under 50px threshold is ignored', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.touchStart(dialog, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 130 }] });
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('swipe at boundary (last image, swipe left) does not navigate', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={1}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.touchStart(dialog, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100 }] });
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Counter format
  // ---------------------------------------------------------------------------

  describe('counter format', () => {
    it('counter renders as "X / Y" with current index 1-based', () => {
      const manyImages = Array.from(
        { length: 7 },
        (_, i) => `https://example.com/photo-${i + 1}.jpg`,
      );
      render(
        <MediaLightbox
          images={manyImages}
          currentIndex={2}
          onClose={() => {}}
          onNavigate={() => {}}
        />,
      );
      expect(screen.getByText('3 / 7')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Backdrop click
  // ---------------------------------------------------------------------------

  describe('backdrop click', () => {
    it('click on backdrop (overlay itself) calls onClose', () => {
      const onClose = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={onClose}
          onNavigate={() => {}}
        />,
      );
      const dialog = screen.getByRole('dialog');
      // Clicking the dialog element directly simulates clicking the backdrop
      // because the dialog IS the overlay, and handleBackdropClick checks
      // e.target === overlayRef.current
      fireEvent.click(dialog);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('click on inner image container does not call onClose', async () => {
      const onClose = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={onClose}
          onNavigate={() => {}}
        />,
      );
      const img = screen.getByRole('img');
      await userEvent.click(img);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Focus trap (Tab wrap)
  // ---------------------------------------------------------------------------

  describe('focus trap', () => {
    it('Tab from last focusable button wraps to first', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');

      // Focusable buttons: close (first), next (last, since prev is hidden at index 0)
      const nextButton = screen.getByRole('button', { name: /next image/i });
      nextButton.focus();
      expect(document.activeElement).toBe(nextButton);

      fireEvent.keyDown(dialog, { key: 'Tab' });

      // Should wrap to close button (first focusable)
      const closeButton = screen.getByRole('button', {
        name: /close preview/i,
      });
      expect(document.activeElement).toBe(closeButton);
    });

    it('Shift+Tab from first focusable button wraps to last', () => {
      const onNavigate = vi.fn();
      render(
        <MediaLightbox
          images={images}
          currentIndex={0}
          onClose={() => {}}
          onNavigate={onNavigate}
        />,
      );
      const dialog = screen.getByRole('dialog');

      // Close button is first focusable, next button is last (prev hidden at index 0)
      const closeButton = screen.getByRole('button', {
        name: /close preview/i,
      });
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);

      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });

      const nextButton = screen.getByRole('button', { name: /next image/i });
      expect(document.activeElement).toBe(nextButton);
    });
  });
});
