import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import {
  checkStorageQuota,
  estimateDownloadSize,
  formatBytes,
} from '@/lib/map/smp-download';

import { mapMessages } from './messages';

/** Module-level tracker: only one map download may run at a time. */
const activeDownloads = new Map<string, AbortController>();

interface DownloadPanelProps {
  map: SavedMap;
  /** Mapbox access token for Mapbox styles (optional). */
  mapboxAccessToken?: string;
}

const MAX_RETRIES = 3;

export function DownloadPanel({ map, mapboxAccessToken }: DownloadPanelProps) {
  const intl = useIntl();
  const downloadMap = useDownloadMap();
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false); // Guards against React-batched double-clicks
  const isRetryRef = useRef(false); // Marks handleDownload calls from handleRetry
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
    bytes: number;
  } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isStartingRetry, setIsStartingRetry] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [exportMissing, setExportMissing] = useState(false);
  const storageBypassedRef = useRef(false);
  const exportUrlRef = useRef<string | null>(null);
  const exportBlobNameRef = useRef<string>('');

  // Check blob availability in IndexedDB without creating an object URL
  useEffect(() => {
    if (map.status !== 'ready') return;
    let cancelled = false;
    const name = `${map.name.replace(/[^a-zA-Z0-9_ -]/g, '_')}-${new Date().toISOString().slice(0, 10)}.smp`;
    exportBlobNameRef.current = name;
    void (async () => {
      const db = getDb();
      try {
        const stored = await db.maps.get(map.id);
        if (cancelled) return;
        if (stored?.smpBlob) {
          setExportReady(true);
          setExportMissing(false);
        } else {
          setExportReady(false);
          setExportMissing(true);
        }
      } catch {
        setExportMissing(true);
      }
    })();
    return () => {
      cancelled = true;
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
        exportUrlRef.current = null;
      }
      setExportReady(false);
    };
  }, [map.id, map.name, map.status, map.smpSize]);

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
    setIsStartingRetry(false);
    pendingRef.current = true; // Set BEFORE async quota check to prevent duplicates

    // Storage quota check — gate unless user bypassed
    if (!storageBypassedRef.current) {
      try {
        const { sufficient, available } =
          await checkStorageQuota(estimatedBytes);
        if (!sufficient && available >= 0) {
          setStorageWarning(
            intl.formatMessage(mapMessages.downloadStorageWarning, {
              available: formatBytes(available),
              estimated: estimatedFormatted,
            }),
          );
          pendingRef.current = false;
          isRetryRef.current = false; // Don't latch retry flag on early return
          return;
        }
      } catch {
        // If quota check fails (e.g. storage API unavailable), let the user proceed
      }
    }

    // Download is actually starting — count retry if triggered via handleRetry
    if (isRetryRef.current) {
      setRetryCount((n) => n + 1);
      isRetryRef.current = false;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    activeDownloads.set(map.id, controller);

    try {
      await downloadMap.mutateAsync({
        map,
        onProgress: setProgress,
        signal: controller.signal,
        mapboxAccessToken,
      });
    } catch (error) {
      // Cancel produces an AbortError — reset mutation state so the
      // error UI doesn't show "Download failed: Download cancelled".
      if (error instanceof DOMException && error.name === 'AbortError') {
        downloadMap.reset();
      }
      // Retry budget is tracked in handleRetry only, so cancellations
      // and the initial download never consume it.
    } finally {
      activeDownloads.delete(map.id);
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
    isRetryRef.current = true;
    setIsStartingRetry(true);
    downloadMap.reset();
    void handleDownload();
  }, [downloadMap, handleDownload, retryCount]);

  // ---- Stuck downloading state (recovery after refresh/crash) ----
  if (
    map.status === 'downloading' &&
    !downloadMap.isPending &&
    !isDownloading &&
    !downloadMap.isError &&
    !isStartingRetry
  ) {
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning/5 p-3"
        data-testid="download-stuck"
      >
        <p className="text-sm text-warning">
          {intl.formatMessage(mapMessages.downloadInterrupted)}
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

  // ---- Storage warning (must come before ready/error states so it's visible when quota blocks retry) ----
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
              setStorageWarning(null);
              void handleDownload();
            }}
          >
            {intl.formatMessage(mapMessages.downloadTryAnyway)}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Ready state (download complete, SMP stored in Dexie) ----
  if (map.status === 'ready' && !downloadMap.isPending) {
    // Blob missing after load — offer regenerate instead of stuck loading
    if (exportMissing) {
      return (
        <div
          className="flex flex-col gap-3 rounded-card border border-error/30 bg-error/5 p-3"
          data-testid="download-ready-missing"
        >
          <p className="text-sm text-error">
            {intl.formatMessage(mapMessages.downloadMissing)}
          </p>
          <Button size="sm" className="w-full" onClick={handleDownload}>
            {intl.formatMessage(mapMessages.downloadRetry)}
          </Button>
        </div>
      );
    }
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
          disabled={!exportReady}
          loading={!exportReady}
          onClick={async () => {
            if (!exportReady) return;

            // Reuse existing URL if available
            let url = exportUrlRef.current;
            if (!url) {
              // Load blob from IndexedDB and create object URL on demand
              const db = getDb();
              const stored = await db.maps.get(map.id);
              if (!stored?.smpBlob) return;
              url = URL.createObjectURL(stored.smpBlob);
              exportUrlRef.current = url;
              // Auto-revoke after 5s to avoid leaking
              setTimeout(() => {
                if (exportUrlRef.current === url) {
                  URL.revokeObjectURL(url);
                  exportUrlRef.current = null;
                }
              }, 5000);
            }

            const a = document.createElement('a');
            a.href = url;
            a.download = exportBlobNameRef.current;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }}
        >
          {intl.formatMessage(mapMessages.downloadExport)}
        </Button>
      </div>
    );
  }

  // ---- Error state (hidden while mutation is in flight or retry starting) ----
  if (
    !downloadMap.isPending &&
    !isStartingRetry &&
    (downloadMap.isError || map.status === 'error')
  ) {
    const errorMessage =
      downloadMap.error instanceof Error
        ? downloadMap.error.message
        : (map.errorMessage ??
          intl.formatMessage(mapMessages.downloadUnknownError));
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

  // ---- Main download button state ----
  return (
    <div className="flex flex-col gap-3" data-testid="download-panel">
      <span className="text-sm text-text-muted">{map.name}</span>
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
