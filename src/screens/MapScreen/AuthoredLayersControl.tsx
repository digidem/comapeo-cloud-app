import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { AuthoredLayerValidationError } from '@/lib/map/authored-layers';
import { MAX_GEOJSON_OVERLAY_MEGABYTES } from '@/lib/map/geojson-overlays';
import type { AuthoredLayerDraftEntry } from '@/lib/schemas/saved-map';

import { mapMessages } from './messages';

interface AuthoredLayersControlProps {
  entries: readonly AuthoredLayerDraftEntry[];
  draftIssues?: ReadonlyMap<
    AuthoredLayerDraftEntry['key'],
    AuthoredLayerValidationError
  >;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  onToggle: (key: AuthoredLayerDraftEntry['key']) => void;
  onRemove: (key: AuthoredLayerDraftEntry['key']) => void;
  onMove: (key: AuthoredLayerDraftEntry['key'], delta: -1 | 1) => void;
  error?: string | null;
  loading?: boolean;
}

function getSafeInvalidLayerName(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(raw, 'name');
  } catch {
    return null;
  }
  if (
    !descriptor ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'string'
  ) {
    return null;
  }
  const value = descriptor.value;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return null;
    }
  }
  if (new TextEncoder().encode(value).byteLength > 256) return null;
  return value;
}

export function AuthoredLayersControl({
  entries,
  draftIssues = new Map(),
  onFilesSelected,
  onToggle,
  onRemove,
  onMove,
  error,
  loading = false,
}: AuthoredLayersControlProps) {
  const intl = useIntl();
  const titleId = useId();

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className="text-sm font-semibold text-text">
          {intl.formatMessage(mapMessages.authoredLayersTitle)}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          {intl.formatMessage(mapMessages.authoredLayersHelp)}
        </p>
      </div>

      <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-btn bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm hover:bg-surface-hover focus-within:ring-2 focus-within:ring-primary">
        <span>
          {intl.formatMessage(
            loading
              ? mapMessages.authoredLayersLoading
              : mapMessages.authoredLayersAdd,
          )}
        </span>
        <input
          type="file"
          className="sr-only"
          accept=".geojson,.json,application/geo+json,application/json"
          multiple
          disabled={loading}
          aria-label={intl.formatMessage(mapMessages.authoredLayersAdd)}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) void onFilesSelected(files);
          }}
        />
      </label>
      <p className="text-xs text-text-muted">
        {intl.formatMessage(mapMessages.referenceOverlaysSizeLimit, {
          max: MAX_GEOJSON_OVERLAY_MEGABYTES,
        })}
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-btn bg-error/10 px-3 py-2 text-sm text-error"
        >
          {error}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="authored-layer-list">
          {entries.map((entry, index) => {
            if (entry.kind === 'invalid') {
              return (
                <li
                  key={entry.key}
                  data-testid="authored-layer-invalid"
                  className="rounded-btn border border-error/30 bg-error/5 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-error">
                        {getSafeInvalidLayerName(entry.raw) ??
                          intl.formatMessage(mapMessages.authoredLayerInvalid)}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {intl.formatMessage(
                          mapMessages.authoredLayerInvalidGuidance,
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.key)}
                      aria-label={intl.formatMessage(
                        mapMessages.authoredLayerRemoveInvalid,
                      )}
                      className="min-h-11 rounded-btn px-2 text-xs font-semibold text-error hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {intl.formatMessage(
                        mapMessages.referenceOverlaysRemoveAction,
                      )}
                    </button>
                  </div>
                </li>
              );
            }

            const { layer } = entry;
            const draftIssue = draftIssues.get(entry.key);
            const rasterZoomIssue = draftIssue?.issues.some(
              (issue) => issue.code === 'EMPTY_RASTER_EFFECTIVE_ZOOM_RANGE',
            );
            return (
              <li key={entry.key} className="rounded-btn bg-surface px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {layer.name}
                  </span>
                  <button
                    type="button"
                    aria-label={intl.formatMessage(
                      layer.visible
                        ? mapMessages.authoredLayerHide
                        : mapMessages.authoredLayerShow,
                      { name: layer.name },
                    )}
                    onClick={() => onToggle(entry.key)}
                    className="min-h-11 rounded-btn px-2 text-xs font-semibold text-primary"
                  >
                    {intl.formatMessage(
                      layer.visible
                        ? mapMessages.referenceOverlaysHideAction
                        : mapMessages.referenceOverlaysShowAction,
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={intl.formatMessage(
                      mapMessages.authoredLayerMoveUp,
                      {
                        name: layer.name,
                      },
                    )}
                    onClick={() => onMove(entry.key, -1)}
                    className="min-h-11 rounded-btn px-2 text-xs font-semibold text-text-muted disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === entries.length - 1}
                    aria-label={intl.formatMessage(
                      mapMessages.authoredLayerMoveDown,
                      {
                        name: layer.name,
                      },
                    )}
                    onClick={() => onMove(entry.key, 1)}
                    className="min-h-11 rounded-btn px-2 text-xs font-semibold text-text-muted disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={intl.formatMessage(
                      mapMessages.authoredLayerRemove,
                      {
                        name: layer.name,
                      },
                    )}
                    onClick={() => onRemove(entry.key)}
                    className="min-h-11 rounded-btn px-2 text-xs font-semibold text-error"
                  >
                    {intl.formatMessage(
                      mapMessages.referenceOverlaysRemoveAction,
                    )}
                  </button>
                </div>
                {draftIssue ? (
                  <p className="mt-1 text-xs text-error" role="alert">
                    {rasterZoomIssue
                      ? intl.formatMessage(mapMessages.authoredRasterZoomError)
                      : draftIssue.issues[0]?.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export type { AuthoredLayersControlProps };
