import { useCallback, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { AuthImg } from '@/components/shared/auth-img';
import { MediaLightbox } from '@/components/shared/media-lightbox';
import { getAttachmentUrl } from '@/lib/api-client';

const messages = defineMessages({
  viewPhoto: {
    id: 'photoGallery.viewPhoto',
    defaultMessage: 'View {photoName}',
  },
});

interface Photo {
  driveId: string;
  name: string;
  type: string;
}

interface PhotoGalleryProps {
  photos: Photo[];
  projectId: string;
}

export function PhotoGallery({ photos, projectId }: PhotoGalleryProps) {
  const intl = useIntl();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openedThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const [focusOnClose, setFocusOnClose] = useState<HTMLButtonElement | null>(
    null,
  );

  const imageUrls = photos.map((photo) =>
    getAttachmentUrl(
      projectId,
      photo.driveId,
      photo.type,
      photo.name,
      'original',
    ),
  );

  const handleThumbnailClick = useCallback((index: number) => {
    // Store reference to the thumbnail that opened the preview for focus restoration
    openedThumbnailRef.current = thumbnailRefs.current[index] ?? null;
    setFocusOnClose(openedThumbnailRef.current);
    setPreviewIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    // MediaLightbox handles focus restoration via focusOnClose prop on unmount
    openedThumbnailRef.current = null;
    setFocusOnClose(null);
    setPreviewIndex(null);
  }, []);

  const handleNavigate = useCallback((index: number) => {
    // Update the stored thumbnail reference when navigating
    openedThumbnailRef.current = thumbnailRefs.current[index] ?? null;
    setFocusOnClose(openedThumbnailRef.current);
    setPreviewIndex(index);
  }, []);

  if (photos.length === 0) {
    return <p>No photos</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <button
            key={photo.driveId}
            ref={(el) => {
              thumbnailRefs.current[index] = el;
            }}
            type="button"
            onClick={() => handleThumbnailClick(index)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-card"
            aria-label={intl.formatMessage(messages.viewPhoto, {
              photoName: photo.name,
            })}
          >
            <AuthImg
              src={getAttachmentUrl(
                projectId,
                photo.driveId,
                photo.type,
                photo.name,
                'thumbnail',
              )}
              alt={photo.name}
              className="w-full rounded-card"
            />
          </button>
        ))}
      </div>

      {previewIndex !== null && (
        <MediaLightbox
          images={imageUrls}
          currentIndex={previewIndex}
          onClose={handleClose}
          onNavigate={handleNavigate}
          focusOnClose={focusOnClose}
        />
      )}
    </div>
  );
}

export type { PhotoGalleryProps, Photo };
