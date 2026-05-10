import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { getAttachmentUrl } from '@/lib/api-client';

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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return <p>No photos</p>;
  }

  const selectedPhoto = previewIndex !== null ? photos[previewIndex] : null;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <button
            key={photo.driveId}
            type="button"
            onClick={() => setPreviewIndex(index)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-card"
          >
            <img
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

      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        >
          <img
            src={getAttachmentUrl(
              projectId,
              selectedPhoto.driveId,
              selectedPhoto.type,
              selectedPhoto.name,
              'original',
            )}
            alt={`${selectedPhoto.name} preview`}
            className="rounded-card shadow-modal overflow-hidden max-h-[90vh] max-w-[90vw]"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPreviewIndex(null)}
            aria-label="Close preview"
            className="absolute top-4 right-4"
          >
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export type { PhotoGalleryProps, Photo };
