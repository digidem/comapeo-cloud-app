import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { formatBytes } from '@/lib/map/smp-download';

import { mapMessages } from './messages';

interface DownloadHistoryProps {
  /**
   * Maps to display in the history list. Each must have a `status` of
   * `ready` or `error` to be relevant as a completed/failed download.
   * The parent (MapScreen) is responsible for filtering.
   */
  maps: SavedMap[];
  /** Whether the maps query is still loading (for skeleton state). */
  isLoading?: boolean;
}

/**
 * Displays a chronological list of past downloads (ready + error maps).
 *
 * Each entry shows the map name, size, status, and a retry button for
 * failed downloads. This is the "download history" view from issue #17
 * (Phase 1 'Should Have').
 */
export function DownloadHistory({ maps, isLoading }: DownloadHistoryProps) {
  const intl = useIntl();
  const downloadMap = useDownloadMap();
  const { addToast } = useToast();

  const completed = maps.filter(
    (m) => m.status === 'ready' || m.status === 'error',
  );

  function handleRetry(map: SavedMap) {
    downloadMap.mutate(
      { map },
      {
        onSuccess: () => {
          addToast({
            variant: 'success',
            title: intl.formatMessage(mapMessages.downloadReady, {
              size: formatBytes(map.smpSize ?? 0),
            }),
          });
        },
        onError: (error) => {
          addToast({
            variant: 'error',
            title: intl.formatMessage(mapMessages.downloadFailed, {
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text">
          {intl.formatMessage(mapMessages.historyTitle)}
        </h2>
        <div className="flex flex-col gap-2">
          <Skeleton height={80} className="rounded-card" />
          <Skeleton height={80} className="rounded-card" />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.historyTitle)}
      </h2>

      {completed.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">
          {intl.formatMessage(mapMessages.historyEmpty)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {completed.map((map) => {
          const isError = map.status === 'error';
          return (
            <article
              key={map.id}
              data-testid="download-history-row"
              className="rounded-card bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-text">
                    {map.name}
                  </h3>
                  {map.smpSize !== undefined ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {intl.formatMessage(mapMessages.historySize, {
                        size: formatBytes(map.smpSize),
                      })}
                    </p>
                  ) : null}
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isError
                        ? 'bg-error/10 text-error'
                        : 'bg-success/10 text-success'
                    }`}
                  >
                    {intl.formatMessage(
                      isError
                        ? mapMessages.historyStatusError
                        : mapMessages.historyStatusReady,
                    )}
                  </span>
                  {isError && map.errorMessage ? (
                    <p
                      className="mt-1 text-xs text-error"
                      title={map.errorMessage}
                    >
                      {map.errorMessage}
                    </p>
                  ) : null}
                </div>
                {isError ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRetry(map)}
                    loading={downloadMap.isPending}
                  >
                    {intl.formatMessage(mapMessages.historyRetry)}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export type { DownloadHistoryProps };
