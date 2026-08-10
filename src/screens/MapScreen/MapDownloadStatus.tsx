import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/lib/map/smp-download';
import { useMapDownloadStore } from '@/stores/map-download-store';

import { mapMessages } from './messages';

export function MapDownloadStatus() {
  const intl = useIntl();
  const active = useMapDownloadStore((state) => state.active);

  if (!active) return null;

  const pct =
    active.progress && active.progress.total > 0
      ? Math.round((active.progress.downloaded / active.progress.total) * 100)
      : 0;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-card bg-surface-card p-4 shadow-elevated sm:left-4 sm:right-auto sm:mx-0 sm:w-[360px]"
      data-testid="map-download-status"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {active.mapName}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {active.progress
                ? intl.formatMessage(mapMessages.downloadProgress, {
                    downloaded: active.progress.downloaded,
                    total: active.progress.total,
                    bytes: formatBytes(active.progress.bytes),
                  })
                : intl.formatMessage(mapMessages.downloadStarting)}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-text-muted">
            {pct}%
          </span>
        </div>
        <Progress value={pct} className="w-full" />
        <Button variant="secondary" size="sm" onClick={active.cancel}>
          {intl.formatMessage(mapMessages.downloadCancel)}
        </Button>
      </div>
    </div>
  );
}
