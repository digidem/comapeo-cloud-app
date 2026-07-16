import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { mapsQueryKey, useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import {
  checkStorageQuota,
  estimateDownloadSize,
  formatBytes,
} from '@/lib/map/smp-download';

import { mapMessages } from './messages';

interface DownloadPanelProps {
  map: SavedMap;
  /** Mapbox access token for Mapbox styles (optional). */
  mapboxAccessToken?: string;
}

const MAX_RETRIES = 3;

export function DownloadPanel({ map, mapboxAccessToken }: DownloadPanelProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const downloadMap = useDownloadMap();
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false); // Guards against React-batched double-clicks
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
    bytes: number;
  } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const storageBypassedRef = useRef(false);

  // --- Cancel on unmount ---
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const estimatedBytes = estimateDownloadSize(
    map.bbox,
    0, // library always downloads from zoom 0 regardless of user minZoom setting
    map.maxZoom,
  );
  const estimatedFormatted = formatBytes(estimatedBytes);
  const isLarge = estimatedBytes > 100 * 1024 * 1024;

  const isDownloading = downloadMap.isPending && progress !== null;

  const handleDownload = useCallback(async () => {
    if (downloadMap.isPending || pendingRef.current) return; // Double-click guard
    pendingRef.current = true;

    // Storage quota check — gate unless user bypassed
    if (!storageBypassedRef.current) {
      const { sufficient, available } = await checkStorageQuota(estimatedBytes);
      if (!sufficient && available >= 0) {
        setStorageWarning(
          intl.formatMessage(mapMessages.downloadStorageWarning, {
            available: formatBytes(available),
            estimated: estimatedFormatted,
          }),
        );
        pendingRef.current = false;
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await downloadMap.mutateAsync({
        map,
        onProgress: setProgress,
        signal: controller.signal,
        mapboxAccessToken,
      });
    } catch {
      // Error handled by mutation state
    } finally {
      pendingRef.current = false;
    }
    setProgress(null);
    abortRef.current = null;
  }, [
    downloadMap,
    map,
    estimatedBytes,
    estimatedFormatted,
    intl,
    mapboxAccessToken,
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRetry = useCallback(() => {
    if (pendingRef.current) return;
    if (downloadMap.isPending) return;
    if (retryCount >= MAX_RETRIES) return;
    setRetryCount((n) => n + 1);
    downloadMap.reset();
    void handleDownload();
  }, [downloadMap, handleDownload, retryCount]);

  // ---- Stuck downloading state (recovery after refresh/crash) ----
  if (map.status === 'downloading' && !isDownloading && !downloadMap.isError) {
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning/5 p-3"
        data-testid="download-stuck"
      >
        <p className="text-sm text-warning">
          A previous download was interrupted. You can try again.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownload}
          className="w-full"
        >
          {intl.formatMessage(mapMessages.downloadRetry)}
        </Button>
      </div>
    );
  }

  // ---- Pending state (mutation started, awaiting first progress) ----
  if (downloadMap.isPending && !isDownloading) {
    return (
      <div className="flex flex-col gap-3" data-testid="download-pending">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">
            {intl.formatMessage(mapMessages.downloadStarting)}
          </span>
        </div>
        <Progress value={0} className="w-full animate-pulse" />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCancel}
          className="w-full"
        >
          {intl.formatMessage(mapMessages.downloadCancel)}
        </Button>
      </div>
    );
  }

  // ---- Downloading state (progress available) ----
  if (isDownloading) {
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.downloaded / progress.total) * 100)
        : 0;
    return (
      <div className="flex flex-col gap-3" data-testid="download-progress">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">
            {intl.formatMessage(mapMessages.downloadProgress, {
              downloaded: progress?.downloaded ?? 0,
              total: progress?.total ?? 0,
              bytes: formatBytes(progress?.bytes ?? 0),
            })}
          </span>
          <span className="text-xs text-text-muted">{pct}%</span>
        </div>
        <Progress value={pct} className="w-full" />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCancel}
          className="w-full"
        >
          {intl.formatMessage(mapMessages.downloadCancel)}
        </Button>
      </div>
    );
  }

  // ---- Ready state (download complete, SMP stored in Dexie) ----
  if (map.status === 'ready' && !downloadMap.isPending) {
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-success/30 bg-success/5 p-3"
        data-testid="download-ready"
      >
        <p className="text-sm text-success">
          {intl.formatMessage(mapMessages.downloadReady, {
            size: formatBytes(map.smpSize ?? 0),
          })}
        </p>
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            // Read blob from Dexie and trigger browser save dialog
            void (async () => {
              const db = getDb();
              try {
                const stored = await db.maps.get(map.id);
                if (!stored?.smpBlob) {
                  throw new Error(
                    'Saved map package is missing or unreadable.',
                  );
                }
                const url = URL.createObjectURL(stored.smpBlob);
                const a = document.createElement('a');
                a.href = url;
                const dateStr = new Date().toISOString().slice(0, 10);
                a.download = `${map.name.replace(/[^a-zA-Z0-9_ -]/g, '_')}-${dateStr}.smp`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 30_000);
              } catch (exportError) {
                // Surface the failure through the standard error/retry UI
                // instead of leaving the ready card visible with no file.
                const message =
                  exportError instanceof Error
                    ? exportError.message
                    : 'Unable to export the saved map file.';
                await db.maps.update(map.id, {
                  status: 'error',
                  errorMessage: message,
                });
                void queryClient.invalidateQueries({
                  queryKey: mapsQueryKey(map.projectLocalId),
                });
              }
            })();
          }}
        >
          {intl.formatMessage(mapMessages.downloadExport)}
        </Button>
      </div>
    );
  }

  // ---- Error state (hidden while mutation is in flight) ----
  if (
    !downloadMap.isPending &&
    (downloadMap.isError || map.status === 'error')
  ) {
    const errorMessage =
      downloadMap.error instanceof Error
        ? downloadMap.error.message
        : (map.errorMessage ?? 'Unknown error');
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-error/30 bg-error/5 p-3"
        data-testid="download-error"
      >
        <p className="text-sm text-error">
          {intl.formatMessage(mapMessages.downloadFailed, {
            error: errorMessage,
          })}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRetry}
          disabled={retryCount >= MAX_RETRIES}
        >
          {retryCount >= MAX_RETRIES
            ? intl.formatMessage(mapMessages.downloadMaxRetries)
            : intl.formatMessage(mapMessages.downloadRetry)}
        </Button>
      </div>
    );
  }

  // ---- Storage warning ----
  if (storageWarning) {
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning/5 p-3"
        data-testid="download-storage-warning"
      >
        <p className="text-sm text-warning">{storageWarning}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStorageWarning(null)}
          >
            {intl.formatMessage(mapMessages.downloadCancel)}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              storageBypassedRef.current = true;
              void handleDownload();
            }}
          >
            {intl.formatMessage(mapMessages.downloadTryAnyway)}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Main download button state ----
  return (
    <div className="flex flex-col gap-3" data-testid="download-panel">
      {showConfirm ? (
        <div className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning/5 p-3">
          <p className="text-sm text-warning">
            {intl.formatMessage(mapMessages.downloadConfirmLarge, {
              size: estimatedFormatted,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowConfirm(false)}
            >
              {intl.formatMessage(mapMessages.downloadCancel)}
            </Button>
            <Button size="sm" onClick={handleDownload}>
              {intl.formatMessage(mapMessages.downloadButton)}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-xs text-text-muted">
            {intl.formatMessage(mapMessages.downloadEstimatedSize, {
              size: estimatedFormatted,
            })}
          </div>
          <Button
            onClick={isLarge ? () => setShowConfirm(true) : handleDownload}
            loading={downloadMap.isPending}
            className="w-full"
          >
            {intl.formatMessage(mapMessages.downloadButton)}
          </Button>
        </>
      )}
    </div>
  );
}
