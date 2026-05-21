import { defineMessages, useIntl } from 'react-intl';

import { AuthImg } from '@/components/shared/auth-img';

const messages = defineMessages({
  moreCount: {
    id: 'mediaPreview.moreCount',
    defaultMessage: '+{count} more',
  },
  moreCountAriaLabel: {
    id: 'mediaPreview.moreCountAriaLabel',
    defaultMessage: '{count} more media files',
  },
  photoAlt: {
    id: 'mediaPreview.photoAlt',
    defaultMessage: 'Photo {number}',
  },
  audioAlt: {
    id: 'mediaPreview.audioAlt',
    defaultMessage: 'Audio attachment',
  },
});

interface MediaPreviewProps {
  observationLocalId: string;
  tags?: Record<string, string>;
}

/**
 * Renders a compact media preview for an observation card.
 *
 * Shows up to 2 photo thumbnails using AuthImg, an audio icon when audio
 * attachments exist, and a "+N more" text indicator when total media exceeds
 * the visible slots. Returns null when no media is present.
 *
 * IMPORTANT: This component renders plain text for "+N more" — no interactive
 * elements (no button, link, or tabIndex). The parent card is already wrapped
 * in a <Link> so the user can click anywhere to navigate.
 */
export function MediaPreview({
  observationLocalId: _observationLocalId,
  tags,
}: MediaPreviewProps) {
  const intl = useIntl();

  if (!tags) return null;

  // Filter out empty strings from split (handles trailing commas, consecutive commas, empty string)
  const photoUrls = tags.photoUrls
    ? tags.photoUrls
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean)
    : [];
  const rawAudioCount = tags.audioCount ? Number(tags.audioCount) : 0;
  const safeAudioCount = Number.isFinite(rawAudioCount)
    ? Math.max(0, Math.floor(rawAudioCount))
    : 0;
  const totalMedia = photoUrls.length + safeAudioCount;

  if (totalMedia === 0) return null;

  // Show up to 2 photo thumbnails
  const visiblePhotos = photoUrls.slice(0, 2);

  // Calculate remaining: total - what we actually show (photos + audio icon if visible)
  const shownItems = visiblePhotos.length + (safeAudioCount > 0 ? 1 : 0);
  const actualRemaining = totalMedia - Math.min(shownItems, 2);

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {visiblePhotos.map((url, index) => (
        <div
          key={url}
          className="h-10 w-10 overflow-hidden rounded-md bg-surface-container-low"
        >
          <AuthImg
            src={url}
            alt={intl.formatMessage(messages.photoAlt, { number: index + 1 })}
            className="h-full w-full object-cover"
          />
        </div>
      ))}

      {safeAudioCount > 0 && visiblePhotos.length < 2 && (
        <div
          data-testid="audio-icon"
          role="img"
          className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-container-low"
          aria-label={intl.formatMessage(messages.audioAlt)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 1v22M8 5v14M4 9v6M16 5v14M20 9v6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {actualRemaining > 0 && (
        <span
          className="text-primary text-xs font-medium whitespace-nowrap"
          aria-label={intl.formatMessage(messages.moreCountAriaLabel, {
            count: actualRemaining,
          })}
        >
          {intl.formatMessage(messages.moreCount, {
            count: actualRemaining,
          })}
        </span>
      )}
    </div>
  );
}
