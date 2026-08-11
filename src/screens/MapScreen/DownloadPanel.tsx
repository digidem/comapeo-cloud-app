import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import {
  checkStorageQuota,
  estimateDownloadSize,
  formatBytes,
} from '@/lib/map/smp-download';
import { useMapDownloadStore } from '@/stores/map-download-store';

import { mapMessages } from './messages';

/**
 * Per-tab download concurrency lock. Prevents multiple concurrent downloads
 * within the same browser tab. Cross-tab isolation is NOT enforced — two
 * tabs can still race on the same map's IDB status. This is acceptable
 * because: (a) multi-tab usage is uncommon for this app, (b) the IDB
 * status writes use recoveryWrite() with retry, and (c) the user would
 * need to manually start two downloads simultaneously.
 */
const activeDownloads = new Map<string, AbortController>();

interface DownloadPanelProps {
  map: SavedMap;
  /** Mapbox access token for Mapbox styles (optional). */
  mapboxAccessToken?: string;
}

const MAX_RETRIES = 3;

// Persisted across remounts (e.g. a refresh mid-download) so retry entry
// points — which reuse whatever this state holds — respect a toggle the
// user already set, instead of silently resetting to the default.
const GLOBAL_OVERVIEW_STORAGE_KEY = 'comapeo:downloadIncludeGlobalOverview';

function readStoredIncludeGlobalOverview(): boolean {
  try {
    const stored = localStorage.getItem(GLOBAL_OVERVIEW_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function DownloadPanel({ map, mapboxAccessToken }: DownloadPanelProps) {
  const intl = useIntl();
  const downloadMap = useDownloadMap();
  const activeDownload = useMapDownloadStore((state) => state.active);
  const startDownload = useMapDownloadStore((state) => state.start);
  const updateDownloadProgress = useMapDownloadStore(
    (state) => state.updateProgress,
  );
  const clearDownload = useMapDownloadStore((state) => state.clear);
  const activeForMap = activeDownload?.mapId === map.id ? activeDownload : null;
  const progress = activeForMap?.progress ?? null;
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false); // Guards against React-batched double-clicks
  const isRetryRef = useRef(false); // Marks handleDownload calls from handleRetry
  const [showConfirm, setShowConfirm] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isStartingRetry, setIsStartingRetry] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [exportMissing, setExportMissing] = useState(false);
  const [concurrencyWarning, setConcurrencyWarning] = useState(false);
  const [includeGlobalOverview, setIncludeGlobalOverviewState] = useState(
    readStoredIncludeGlobalOverview,
  );
  const setIncludeGlobalOverview = useCallback((value: boolean) => {
    setIncludeGlobalOverviewState(value);
    try {
      localStorage.setItem(GLOBAL_OVERVIEW_STORAGE_KEY, String(value));
    } catch {
      // Ignore storage errors (private browsing, quota, etc.) — the
      // in-memory state still drives this session correctly.
    }
  }, []);
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

  const estimatedBytes = estimateDownloadSize(
    map.bbox,
    0, // library always downloads from zoom 0 regardless of user minZoom setting
    map.maxZoom,
    { includeGlobalOverview },
  );
  const estimatedFormatted = formatBytes(estimatedBytes);
  const isLarge = estimatedBytes > 100 * 1024 * 1024;

  const isDownloading = activeForMap !== null && progress !== null;

  const handleDownload = useCallback(async () => {
    if (
      downloadMap.isPending ||
      pendingRef.current ||
      activeDownloads.has(map.id)
    ) {
      return;
    }
    setIsStartingRetry(false);
    pendingRef.current = true; // Set BEFORE async quota check to prevent duplicates

    // Concurrency policy: only one map download may run at a time
    if (activeDownloads.size > 0) {
      pendingRef.current = false;
      isRetryRef.current = false;
      setConcurrencyWarning(true);
      return;
    }

    // Acquire concurrency lock BEFORE any await to prevent two panels
    // from both passing the size check and starting concurrently.
    const controller = new AbortController();
    abortRef.current = controller;
    activeDownloads.set(map.id, controller);

    // Storage quota check — gate unless user bypassed
    if (!storageBypassedRef.current) {
      try {
        const { sufficient, available } =
          await checkStorageQuota(estimatedBytes);
        if (!sufficient && available >= 0) {
          activeDownloads.delete(map.id);
          pendingRef.current = false;
          isRetryRef.current = false;
          setStorageWarning(
            intl.formatMessage(mapMessages.downloadStorageWarning, {
              available: formatBytes(available),
              estimated: estimatedFormatted,
            }),
          );
          return;
        }
      } catch {
        // If quota check fails (e.g. storage API unavailable), let the user proceed
      }
    }

    // Only charge the retry budget for outcomes that actually resolve
    // (success or a genuine failure) — a cancelled retry must not count.
    const isRetryAttempt = isRetryRef.current;
    isRetryRef.current = false;
    startDownload({
      mapId: map.id,
      mapName: map.name,
      cancel: () => controller.abort(),
    });

    try {
      await downloadMap.mutateAsync({
        map,
        onProgress: (nextProgress) => {
          updateDownloadProgress(map.id, nextProgress);
        },
        signal: controller.signal,
        mapboxAccessToken,
        includeGlobalOverview,
      });
      if (isRetryAttempt) {
        setRetryCount((n) => n + 1);
      }
    } catch (error) {
      // Cancel produces an AbortError — reset mutation state so the
      // error UI doesn't show "Download failed: Download cancelled".
      if (error instanceof DOMException && error.name === 'AbortError') {
        downloadMap.reset();
        // Cancelled before it could fail — refund the attempt so
        // retry-and-cancel cycles never exhaust the retry budget.
      } else if (isRetryAttempt) {
        setRetryCount((n) => n + 1);
      }
    } finally {
      activeDownloads.delete(map.id);
      clearDownload(map.id);
      pendingRef.current = false;
    }
    abortRef.current = null;
  }, [
    clearDownload,
    downloadMap,
    map,
    estimatedBytes,
    estimatedFormatted,
    intl,
    mapboxAccessToken,
    includeGlobalOverview,
    startDownload,
    updateDownloadProgress,
  ]);

  const handleCancel = useCallback(() => {
    if (activeForMap) {
      activeForMap.cancel();
      return;
    }
    abortRef.current?.abort();
  }, [activeForMap]);

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
    activeForMap === null &&
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
        <span className="text-sm text-text-muted">{map.name}</span>
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
  if ((activeForMap !== null || downloadMap.isPending) && !isDownloading) {
    return (
      <div className="flex flex-col gap-3" data-testid="download-pending">
        <span className="text-sm text-text-muted">{map.name}</span>
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
        <span className="text-sm text-text-muted">{map.name}</span>
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
        {progress && (progress.skipped > 0 || progress.warning) && (
          <p className="text-sm text-warning">
            {intl.formatMessage(mapMessages.downloadSkippedWarning, {
              n: progress.skipped,
            })}
          </p>
        )}
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
        <span className="text-sm text-text-muted">{map.name}</span>
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

  // ---- Concurrency warning (another download in progress) ----
  if (concurrencyWarning) {
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning/5 p-3"
        data-testid="download-concurrency-warning"
      >
        <span className="text-sm text-text-muted">{map.name}</span>
        <p className="text-sm text-warning">
          {intl.formatMessage(mapMessages.downloadConcurrencyWarning)}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConcurrencyWarning(false)}
          className="w-full"
        >
          {intl.formatMessage(mapMessages.downloadCancel)}
        </Button>
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
          <span className="text-sm text-text-muted">{map.name}</span>
          <p className="text-sm text-error">
            {intl.formatMessage(
              map.styleUrl
                ? mapMessages.downloadMissing
                : mapMessages.downloadMissingImported,
            )}
          </p>
          {/* A missing blob makes isImportedSmpMap false by definition. Empty
              styleUrl is therefore the persisted origin marker we can still
              use here: imported packages cannot be regenerated from network. */}
          {map.styleUrl ? (
            <Button size="sm" className="w-full" onClick={handleDownload}>
              {intl.formatMessage(mapMessages.downloadRetry)}
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        className="flex flex-col gap-3 rounded-card border border-success/30 bg-success/5 p-3"
        data-testid="download-ready"
      >
        <span className="text-sm text-text-muted">{map.name}</span>
        <p className="text-sm text-success">
          {intl.formatMessage(
            map.styleUrl
              ? mapMessages.downloadReady
              : mapMessages.downloadImportedReady,
            {
              size: formatBytes(map.smpSize ?? 0),
            },
          )}
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
              try {
                const db = getDb();
                const stored = await db.maps.get(map.id);
                if (!stored?.smpBlob) {
                  setExportMissing(true);
                  return;
                }
                const newUrl = URL.createObjectURL(stored.smpBlob);
                exportUrlRef.current = newUrl;
                url = newUrl;
                // Auto-revoke after 5s to avoid leaking
                setTimeout(() => {
                  if (exportUrlRef.current === newUrl) {
                    URL.revokeObjectURL(newUrl);
                    exportUrlRef.current = null;
                  }
                }, 5000);
              } catch {
                setExportMissing(true);
                return;
              }
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
        <span className="text-sm text-text-muted">{map.name}</span>
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
          <div className="flex flex-col gap-1">
            <Switch
              id={`global-overview-${map.id}`}
              checked={includeGlobalOverview}
              onCheckedChange={setIncludeGlobalOverview}
              disabled={downloadMap.isPending}
              label={intl.formatMessage(mapMessages.downloadGlobalOverview)}
            />
            <p className="text-xs text-text-muted">
              {intl.formatMessage(
                mapMessages.downloadGlobalOverviewDescription,
              )}
            </p>
          </div>
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
