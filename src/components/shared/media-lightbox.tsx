import {
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { AuthImg } from '@/components/shared/auth-img';

const messages = defineMessages({
  closePreview: {
    id: 'mediaLightbox.closePreview',
    defaultMessage: 'Close preview',
  },
  previousImage: {
    id: 'mediaLightbox.previousImage',
    defaultMessage: 'Previous image',
  },
  nextImage: {
    id: 'mediaLightbox.nextImage',
    defaultMessage: 'Next image',
  },
  imageCount: {
    id: 'mediaLightbox.imageCount',
    defaultMessage: 'Image {current} of {total}',
  },
  photoLabel: {
    id: 'mediaLightbox.photoLabel',
    defaultMessage: 'Photo {number}',
  },
});

interface MediaLightboxProps {
  /** Array of image URLs to display */
  images: string[];
  /** Index of the currently displayed image */
  currentIndex: number;
  /** Called when the lightbox should close */
  onClose: () => void;
  /** Called to navigate to a different index */
  onNavigate: (index: number) => void;
}

/**
 * Full-screen image lightbox overlay with:
 * - High-res image display (object-contain, centered on dark backdrop)
 * - Previous / Next navigation arrows (only when multiple images)
 * - Close button top-right (always visible)
 * - Keyboard: Escape to close, Left/Right arrows to navigate
 * - Click on backdrop to close
 * - Smooth open/close animation via motion-safe
 * - Touch-friendly: 44px minimum touch targets
 * - Accessible: role="dialog", aria-modal, focus trap
 */
function MediaLightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: MediaLightboxProps) {
  const intl = useIntl();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const hasMultiple = images.length > 1;
  const safeIndex = Math.min(Math.max(currentIndex, 0), images.length - 1);
  const currentImage = images[safeIndex];
  const canGoPrev = safeIndex > 0;
  const canGoNext = safeIndex < images.length - 1;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (canGoPrev) onNavigate(safeIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (canGoNext) onNavigate(safeIndex + 1);
          break;
        case 'Tab': {
          const focusable = Array.from(
            overlayRef.current?.querySelectorAll<HTMLButtonElement>(
              'button:not([disabled])',
            ) ?? [],
          );
          if (focusable.length === 0) break;

          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) break;

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
          break;
        }
      }
    },
    [onClose, onNavigate, safeIndex, canGoPrev, canGoNext],
  );

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    const endX = e.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 50) return;
    if (deltaX > 0 && canGoPrev) onNavigate(safeIndex - 1);
    if (deltaX < 0 && canGoNext) onNavigate(safeIndex + 1);
  };

  if (!currentImage) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(messages.imageCount, {
        current: currentIndex + 1,
        total: images.length,
      })}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 motion-safe:animate-[fadeIn_200ms_ease-out]"
    >
      <div className="pointer-events-none flex h-full w-full items-center justify-center px-4 py-16">
        <AuthImg
          src={currentImage}
          alt={intl.formatMessage(messages.photoLabel, {
            number: safeIndex + 1,
          })}
          className="pointer-events-auto max-h-full max-w-full rounded-card object-contain motion-safe:animate-[fadeIn_300ms_ease-out]"
        />
      </div>

      {hasMultiple && (
        <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
          {safeIndex + 1} / {images.length}
        </span>
      )}

      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
        aria-label={intl.formatMessage(messages.closePreview)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {hasMultiple && canGoPrev && (
        <button
          type="button"
          onClick={() => onNavigate(safeIndex - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          aria-label={intl.formatMessage(messages.previousImage)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}

      {hasMultiple && canGoNext && (
        <button
          type="button"
          onClick={() => onNavigate(safeIndex + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          aria-label={intl.formatMessage(messages.nextImage)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export { MediaLightbox };
export type { MediaLightboxProps };
