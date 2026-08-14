import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { GeoJsonOverlay } from '@/lib/map/geojson-overlays';

import { mapMessages } from './messages';

interface GeoJsonOverlayControlProps {
  overlays: GeoJsonOverlay[];
  onFilesSelected: (files: File[]) => void | Promise<void>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  error?: string | null;
  onDismissError?: () => void;
  loading?: boolean;
}

export function GeoJsonOverlayControl({
  overlays,
  onFilesSelected,
  onToggle,
  onRemove,
  error,
  onDismissError,
  loading = false,
}: GeoJsonOverlayControlProps) {
  const intl = useIntl();
  const titleId = useId();
  const filePickerLabel = intl.formatMessage(
    loading
      ? mapMessages.referenceOverlaysLoading
      : mapMessages.referenceOverlaysAdd,
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-sm font-semibold text-text">
            {intl.formatMessage(mapMessages.referenceOverlaysTitle)}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {intl.formatMessage(mapMessages.referenceOverlaysHelp)}
          </p>
        </div>
      </div>

      <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-btn bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm hover:bg-surface-hover focus-within:ring-2 focus-within:ring-primary">
        <span aria-live="polite">{filePickerLabel}</span>
        <input
          type="file"
          className="sr-only"
          accept=".geojson,.json,application/geo+json,application/json"
          multiple
          disabled={loading}
          aria-busy={loading}
          aria-label={filePickerLabel}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) void onFilesSelected(files);
          }}
        />
      </label>

      <p className="text-xs text-text-muted">
        {intl.formatMessage(mapMessages.referenceOverlaysSizeLimit)}
      </p>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-btn bg-error/10 px-3 py-2 text-sm text-error"
        >
          <span className="min-w-0 flex-1">{error}</span>
          {onDismissError ? (
            <button
              type="button"
              onClick={onDismissError}
              aria-label={intl.formatMessage(
                mapMessages.referenceOverlaysDismiss,
              )}
              className="min-h-11 shrink-0 rounded-btn px-2 text-xs font-semibold text-error hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {intl.formatMessage(mapMessages.referenceOverlaysDismissAction)}
            </button>
          ) : null}
        </div>
      ) : null}

      {overlays.length > 0 ? (
        <ul
          className="flex flex-col gap-2"
          aria-label={intl.formatMessage(mapMessages.referenceOverlaysList)}
        >
          {overlays.map((overlay) => (
            <li
              key={overlay.id}
              className="flex items-center gap-2 rounded-btn bg-surface px-3 py-2"
            >
              <span
                className="min-w-0 flex-1 truncate text-sm text-text"
                title={overlay.name}
              >
                {overlay.name}
              </span>
              <button
                type="button"
                onClick={() => onToggle(overlay.id)}
                className="min-h-11 rounded-btn px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {intl.formatMessage(
                  overlay.visible
                    ? mapMessages.referenceOverlaysHide
                    : mapMessages.referenceOverlaysShow,
                  { name: overlay.name },
                )}
              </button>
              <button
                type="button"
                aria-label={intl.formatMessage(
                  mapMessages.referenceOverlaysRemove,
                  {
                    name: overlay.name,
                  },
                )}
                onClick={() => onRemove(overlay.id)}
                className="min-h-11 rounded-btn px-2 text-xs font-semibold text-error hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {intl.formatMessage(mapMessages.referenceOverlaysRemoveAction)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export type { GeoJsonOverlayControlProps };
