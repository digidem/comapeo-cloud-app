import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import * as Dialog from '@radix-ui/react-dialog';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import Map from 'react-map-gl/maplibre';

import { Button } from '@/components/ui/button';
import type { SavedMap } from '@/lib/db';
import { isImportedSmpMap } from '@/lib/map/saved-map-utils';
import {
  closeSmpReader,
  getSmpReader,
  registerSmpProtocol,
  resolveSmpStyle,
  sanitizeImportedSmpStyle,
} from '@/lib/map/smp-serve';
import { uuid } from '@/lib/uuid';

import { mapMessages } from './messages';

interface SmpPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: SavedMap | null;
}

function PreviewSession({ map }: { map: SavedMap }) {
  const intl = useIntl();
  // SmpPreviewDialog keys this component by map id + updatedAt. Freeze that
  // version for the lifetime of the session so identity-only query refetches do
  // not tear down and reopen the packaged reader mid-preview.
  const [sessionMap] = useState(map);
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionMap.status !== 'ready' || !sessionMap.smpBlob) return;

    const readerId = `preview:${sessionMap.id}:${uuid()}`;
    let cancelled = false;
    let readerOpened = false;
    registerSmpProtocol();

    void (async () => {
      try {
        const reader = await getSmpReader(readerId, sessionMap.smpBlob!);
        readerOpened = true;

        if (cancelled) {
          await closeSmpReader(readerId);
          return;
        }

        const resolved = await resolveSmpStyle(reader, readerId);
        if (!cancelled) {
          if (resolved) {
            const safeStyle = isImportedSmpMap(sessionMap)
              ? sanitizeImportedSmpStyle(resolved)
              : resolved;
            if (safeStyle) setStyle(safeStyle);
            else setError(true);
          } else {
            setError(true);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (readerOpened) {
        void closeSmpReader(readerId).catch(() => {
          // Cleanup failure must not surface as an unhandled rejection.
        });
      }
    };
  }, [sessionMap]);

  if (sessionMap.status !== 'ready' || !sessionMap.smpBlob || error) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-sm text-error"
        role="alert"
      >
        {intl.formatMessage(mapMessages.previewError)}
      </div>
    );
  }

  if (!style) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full items-center justify-center p-6 text-sm text-text-muted"
      >
        {intl.formatMessage(mapMessages.previewLoading)}
      </div>
    );
  }

  const [west, south, east, north] = sessionMap.bbox;
  return (
    <div
      role="region"
      aria-label={intl.formatMessage(mapMessages.previewTitle)}
      data-testid="smp-preview-map"
      className="h-full w-full"
    >
      <Map
        mapStyle={style}
        attributionControl={{}}
        style={{ width: '100%', height: '100%' }}
        onLoad={(event) => {
          event.target.fitBounds(
            [
              [west, south],
              [east, north],
            ],
            { padding: 50, duration: 0 },
          );
        }}
      />
    </div>
  );
}

export function SmpPreviewDialog({
  open,
  onOpenChange,
  map,
}: SmpPreviewDialogProps) {
  const intl = useIntl();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed inset-0 z-[51] flex flex-col bg-surface-card focus:outline-none sm:left-1/2 sm:top-1/2 sm:h-[80vh] sm:w-[min(90vw,960px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:shadow-modal"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold text-text">
                {map?.name ?? intl.formatMessage(mapMessages.previewTitle)}
              </Dialog.Title>
              {map?.status === 'ready' ? (
                <p className="text-sm text-text-muted">
                  {intl.formatMessage(mapMessages.statusReady)}
                </p>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" size="sm">
                {intl.formatMessage(mapMessages.previewClose)}
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 bg-surface">
            {open && map ? (
              <PreviewSession key={`${map.id}:${map.updatedAt}`} map={map} />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { SmpPreviewDialogProps };
