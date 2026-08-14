import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import {
  type GeoJsonOverlayError,
  parseGeoJsonOverlay,
} from '@/lib/map/geojson-overlay';
import { uuid } from '@/lib/uuid';

import type { GeoJsonOverlay } from './OverlayLayers';
import { mapMessages } from './messages';

interface GeoJsonOverlayPanelProps {
  /** Current list of overlays. */
  overlays: GeoJsonOverlay[];
  /** Called when a new overlay should be added. */
  onAdd: (overlay: GeoJsonOverlay) => void;
  /** Called when an overlay's visibility should be toggled. */
  onToggleVisibility: (id: string) => void;
  /** Called when an overlay should be removed. */
  onRemove: (id: string) => void;
}

/**
 * Maps an internal error kind to a user-visible i18n message.
 */
function errorMessageForKind(
  intl: ReturnType<typeof useIntl>,
  error: GeoJsonOverlayError,
): string {
  switch (error.kind) {
    case 'too-large':
      return intl.formatMessage(mapMessages.overlayErrorTooLarge);
    case 'invalid-json':
      return intl.formatMessage(mapMessages.overlayErrorInvalidJson);
    case 'invalid-geojson':
      return intl.formatMessage(mapMessages.overlayErrorInvalidGeoJson);
  }
}

const ACCEPTED_EXTENSIONS =
  '.geojson,.json,application/geo+json,application/json';

export function GeoJsonOverlayPanel({
  overlays,
  onAdd,
  onToggleVisibility,
  onRemove,
}: GeoJsonOverlayPanelProps) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  // Clear transient errors after a delay so the UI doesn't linger on stale messages.
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setError(null);
      setIsParsing(true);
      for (const file of list) {
        try {
          const data = await parseGeoJsonOverlay(file);
          onAdd({
            id: uuid(),
            fileName: file.name,
            data,
            visible: true,
          });
        } catch (e) {
          const overlayError = e as GeoJsonOverlayError;
          if (overlayError && overlayError.kind) {
            setError(errorMessageForKind(intl, overlayError));
          } else {
            setError(
              intl.formatMessage(mapMessages.overlayErrorInvalidGeoJson),
            );
          }
          // Stop processing remaining files on the first error so no
          // partial overlay state is added.
          break;
        }
      }
      setIsParsing(false);
    },
    [intl, onAdd],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        void handleFiles(files);
      }
    },
    [handleFiles],
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-text">
          {intl.formatMessage(mapMessages.overlayTitle)}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          {intl.formatMessage(mapMessages.overlayDescription)}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={intl.formatMessage(mapMessages.overlayFileLabel)}
        onChange={(event) => {
          const files = event.target.files;
          event.target.value = '';
          if (files) void handleFiles(files);
        }}
      />

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-card border-2 border-dashed px-3 py-4 text-center transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <p className="text-xs text-text-muted">
          {intl.formatMessage(mapMessages.overlayDragDrop)}
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={isParsing}
        onClick={() => inputRef.current?.click()}
      >
        {intl.formatMessage(mapMessages.overlayAddButton)}
      </Button>

      {overlays.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="overlay-list">
          {overlays.map((overlay) => (
            <li
              key={overlay.id}
              data-testid={`overlay-item-${overlay.id}`}
              className="flex items-center gap-2 rounded-btn bg-surface px-3 py-2"
            >
              <button
                type="button"
                onClick={() => onToggleVisibility(overlay.id)}
                aria-pressed={overlay.visible}
                aria-label={
                  overlay.visible
                    ? intl.formatMessage(mapMessages.overlayHide)
                    : intl.formatMessage(mapMessages.overlayShow)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ touchAction: 'manipulation' }}
              >
                {overlay.visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
              </button>
              <span
                className="flex-1 truncate text-sm text-text"
                title={overlay.fileName}
              >
                {overlay.fileName}
              </span>
              <button
                type="button"
                onClick={() => onRemove(overlay.id)}
                aria-label={intl.formatMessage(mapMessages.overlayRemove)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ touchAction: 'manipulation' }}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export type { GeoJsonOverlayPanelProps };

// ── Inline icons ──────────────────────────────────────────────────────────

function EyeOpenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
