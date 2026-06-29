import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteMap,
  useMaps,
  useRenameMap,
  useSetActiveMapMutation,
} from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { useMapStore } from '@/stores/map-store';

import { mapMessages } from './messages';

interface SavedMapsListProps {
  projectLocalId: string | null;
}

const STATUS_MESSAGE_BY_STATUS: Record<
  SavedMap['status'],
  keyof typeof mapMessages
> = {
  draft: 'statusDraft',
  downloading: 'statusDownloading',
  ready: 'statusReady',
  error: 'statusError',
};

export function SavedMapsList({ projectLocalId }: SavedMapsListProps) {
  const intl = useIntl();
  const activeMapId = useMapStore((state) => state.activeMapId);
  const mapsQuery = useMaps(projectLocalId);
  const setActiveMap = useSetActiveMapMutation(projectLocalId);
  const renameMap = useRenameMap(projectLocalId);
  const deleteMap = useDeleteMap(projectLocalId);

  const maps = mapsQuery.data ?? [];

  function handleRename(map: SavedMap) {
    const nextName = window.prompt(
      intl.formatMessage(mapMessages.renamePrompt),
      map.name,
    );
    const trimmedName = nextName?.trim();
    if (!trimmedName) return;

    renameMap.mutate({ mapId: map.id, name: trimmedName });
  }

  function handleDelete(map: SavedMap) {
    if (!window.confirm(intl.formatMessage(mapMessages.confirmDelete))) return;
    deleteMap.mutate(map.id);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.savedMaps)}
      </h2>

      {mapsQuery.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={80} className="rounded-card" />
          <Skeleton height={80} className="rounded-card" />
        </div>
      ) : null}

      {!mapsQuery.isPending && maps.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">
          {intl.formatMessage(mapMessages.savedMapsEmpty)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {maps.map((map) => {
          const isActive = activeMapId === map.id;
          return (
            <article
              key={map.id}
              data-testid="saved-map-row"
              className="rounded-card bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-text">
                    {map.name}
                  </h3>
                  <span className="mt-1 inline-flex rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold capitalize text-text-muted">
                    {intl.formatMessage(
                      mapMessages[STATUS_MESSAGE_BY_STATUS[map.status]],
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={isActive ? 'secondary' : 'primary'}
                  onClick={() => setActiveMap.mutate(isActive ? null : map.id)}
                  loading={setActiveMap.isPending}
                >
                  {intl.formatMessage(
                    isActive ? mapMessages.removeActive : mapMessages.setActive,
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleRename(map)}
                  loading={renameMap.isPending}
                >
                  {intl.formatMessage(mapMessages.rename)}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(map)}
                  loading={deleteMap.isPending}
                >
                  {intl.formatMessage(mapMessages.delete)}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export type { SavedMapsListProps };
