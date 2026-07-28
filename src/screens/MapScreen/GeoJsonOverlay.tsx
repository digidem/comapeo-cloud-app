import type { Feature, FeatureCollection, Geometry } from 'geojson';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { formatBytes } from '@/lib/map/smp-download';
import { uuid } from '@/lib/uuid';

import { mapMessages } from './messages';

/**
 * A single reference-layer overlay loaded from a dropped GeoJSON file.
 */
export interface OverlayEntry {
  id: string;
  name: string;
  data: FeatureCollection;
  visible: boolean;
  color: string;
  size: number;
}

/** Distinct outline colors cycled per file so layers are visually separable. */
const OVERLAY_COLORS = [
  '#E0457B',
  '#2D8A4E',
  '#B85C00',
  '#7B2D8A',
  '#006B8A',
  '#8A4D2D',
];

/** Warn for files larger than this (5 MB) — parsing blocks the main thread. */
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

/**
 * Validate that parsed JSON is a usable GeoJSON shape for an overlay.
 * Accepts FeatureCollection, Feature, or a bare Geometry, then normalises
 * to a FeatureCollection so MapLibre can render it as a single source.
 */
function normalizeGeoJson(value: unknown): FeatureCollection | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as { type?: unknown };

  if (obj.type === 'FeatureCollection') {
    const fc = value as FeatureCollection;
    if (!Array.isArray(fc.features)) return null;
    return fc;
  }

  if (obj.type === 'Feature') {
    const feature = value as Feature;
    if (!feature.geometry) return null;
    return { type: 'FeatureCollection', features: [feature] };
  }

  // Bare geometry (Point, Polygon, LineString, etc.)
  const geometry = value as Geometry;
  if (
    typeof geometry.type === 'string' &&
    geometry.type !== 'GeometryCollection'
  ) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry }],
    };
  }

  return null;
}

interface GeoJsonOverlayProps {
  /**
   * Called with the current overlay entries whenever they change.
   * The parent (MapAuthoringCanvas) uses this to render `<Source>`/`<Layer>`
   * pairs inside the MapLibre `<Map>` — overlays cannot be rendered outside
   * the map tree.
   */
  onOverlaysChange: (overlays: OverlayEntry[]) => void;
}

/**
 * Manages drag-and-drop GeoJSON reference layers on the map authoring canvas.
 *
 * The dropzone is an invisible overlay that captures HTML5 drag-drop events
 * without intercepting map pointer events (pan/zoom). It only activates when
 * a file is being dragged (`onDragEnter`/`onDragOver`), so normal map
 * interaction is unaffected.
 *
 * Overlays are transient — they are not persisted and are cleared on unmount.
 */
export function GeoJsonOverlay({ onOverlaysChange }: GeoJsonOverlayProps) {
  const intl = useIntl();
  const [overlays, setOverlays] = useState<OverlayEntry[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  // Sync overlay state up to the parent for map-layer rendering.
  // Keep a ref of the latest value so the cleanup effect can notify
  // the parent of the final empty state on unmount.
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
    onOverlaysChange(overlays);
  }, [overlays, onOverlaysChange]);

  // Clear all overlays on unmount (transient authoring aid).
  useEffect(() => {
    return () => {
      onOverlaysChange([]);
    };
  }, [onOverlaysChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Must preventDefault on dragOver to allow the drop.
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragActive(false);
      setError(null);

      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.name.toLowerCase().endsWith('.geojson') ||
          f.name.toLowerCase().endsWith('.json'),
      );

      if (files.length === 0) {
        setError(
          intl.formatMessage(mapMessages.overlayInvalid, {
            name: e.dataTransfer.files[0]?.name ?? 'file',
          }),
        );
        return;
      }

      for (const file of files) {
        try {
          const text = await file.text();
          const parsed: unknown = JSON.parse(text);
          const normalized = normalizeGeoJson(parsed);
          if (!normalized) {
            setError(
              intl.formatMessage(mapMessages.overlayInvalid, {
                name: file.name,
              }),
            );
            continue;
          }
          setOverlays((prev) => {
            const color = OVERLAY_COLORS[prev.length % OVERLAY_COLORS.length]!;
            return [
              ...prev,
              {
                id: uuid(),
                name: file.name,
                data: normalized,
                visible: true,
                color,
                size: file.size,
              },
            ];
          });
        } catch {
          setError(
            intl.formatMessage(mapMessages.overlayInvalid, {
              name: file.name,
            }),
          );
        }
      }
    },
    [intl],
  );

  const toggleVisible = useCallback((id: string) => {
    setOverlays((prev) =>
      prev.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)),
    );
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setOverlays([]);
  }, []);

  const largeOverlay = overlays.find((o) => o.size > LARGE_FILE_THRESHOLD);

  return (
    <>
      {/* Dropzone — invisible until a file drag is active */}
      <div
        data-testid="geojson-dropzone"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={
          isDragActive
            ? 'absolute inset-0 z-20 flex items-center justify-center border-4 border-dashed border-primary bg-primary/10'
            : 'absolute inset-0 z-20'
        }
        aria-label={intl.formatMessage(mapMessages.overlayDrop)}
      >
        {isDragActive ? (
          <div className="pointer-events-none rounded-card bg-surface-card px-6 py-4 shadow-elevated">
            <p className="text-sm font-semibold text-primary">
              {intl.formatMessage(mapMessages.overlayDropActive)}
            </p>
          </div>
        ) : null}
      </div>

      {/* Overlay management panel */}
      {overlays.length > 0 || error ? (
        <div
          data-testid="geojson-overlay-panel"
          className="absolute bottom-4 left-4 z-30 flex max-h-[40%] w-64 flex-col gap-2 overflow-y-auto rounded-card bg-surface-card p-3 shadow-elevated"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text">
              {intl.formatMessage(mapMessages.overlayTitle)}
            </h3>
            {overlays.length > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-primary hover:underline"
              >
                {intl.formatMessage(mapMessages.overlayClear)}
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          ) : null}

          {largeOverlay ? (
            <p className="text-xs text-warning">
              {intl.formatMessage(mapMessages.overlayTooLarge, {
                name: largeOverlay.name,
                size: formatBytes(largeOverlay.size),
              })}
            </p>
          ) : null}

          {overlays.length === 0 && !error ? (
            <p className="text-xs text-text-muted">
              {intl.formatMessage(mapMessages.overlayEmpty)}
            </p>
          ) : null}

          {overlays.map((overlay) => (
            <div
              key={overlay.id}
              data-testid="geojson-overlay-row"
              className="flex items-center gap-2"
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: overlay.color }}
              />
              <span
                className={
                  overlay.visible
                    ? 'flex-1 truncate text-xs text-text'
                    : 'flex-1 truncate text-xs text-text-muted line-through'
                }
                title={overlay.name}
              >
                {overlay.name}
              </span>
              <button
                type="button"
                onClick={() => toggleVisible(overlay.id)}
                aria-label={intl.formatMessage(mapMessages.overlayToggle)}
                aria-pressed={overlay.visible}
                className="shrink-0 rounded p-1 text-text-muted hover:text-text hover:bg-surface"
              >
                {overlay.visible ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 15 15"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M7.5 11C4.5 11 2 7.5 2 7.5S4.5 4 7.5 4 13 7.5 13 7.5 10.5 11 7.5 11Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 15 15"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 2L13 13"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M2.5 6C2.5 6 4.5 4 7.5 4C9 4 10.2 4.5 11 5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeOverlay(overlay.id)}
                aria-label={intl.formatMessage(mapMessages.overlayRemove)}
                className="shrink-0 rounded p-1 text-text-muted hover:text-error hover:bg-surface"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 15 15"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export type { GeoJsonOverlayProps };
export type { GeoJSON as GeoJsonData } from 'geojson';
