import { useState } from 'react';

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
            className="cursor-pointer"
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
              className="w-full rounded"
            />
          </button>
        ))}
      </div>

      {selectedPhoto && (
        <div role="dialog" aria-modal="true">
          <img
            src={getAttachmentUrl(
              projectId,
              selectedPhoto.driveId,
              selectedPhoto.type,
              selectedPhoto.name,
              'original',
            )}
            alt={`${selectedPhoto.name} preview`}
          />
          <button
            type="button"
            onClick={() => setPreviewIndex(null)}
            aria-label="Close preview"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export type { PhotoGalleryProps, Photo };
