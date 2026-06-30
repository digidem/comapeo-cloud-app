import { useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
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

type PendingAction =
  | { type: 'active'; mapId: string }
  | { type: 'rename'; mapId: string }
  | { type: 'delete'; mapId: string };

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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<SavedMap | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedMap | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const maps = mapsQuery.data ?? [];
  const hasPendingAction = pendingAction !== null;

  async function runPendingAction(
    action: PendingAction,
    mutate: () => Promise<unknown>,
  ) {
    setPendingAction(action);
    try {
      await mutate();
    } finally {
      setPendingAction(null);
    }
  }

  function openRenameDialog(map: SavedMap) {
    setRenameTarget(map);
    setRenameName(map.name);
    setRenameError(null);
  }

  function openDeleteDialog(map: SavedMap) {
    setDeleteTarget(map);
    setDeleteError(null);
  }

  async function handleActiveToggle(mapId: string, isActive: boolean) {
    setActiveError(null);

    try {
      await runPendingAction({ type: 'active', mapId }, () =>
        setActiveMap.mutateAsync(isActive ? null : mapId),
      );
    } catch {
      setActiveError(intl.formatMessage(mapMessages.activeError));
    }
  }

  async function handleRenameSubmit() {
    if (!renameTarget) return;

    const trimmedName = renameName.trim();
    if (!trimmedName) {
      setRenameError(intl.formatMessage(mapMessages.nameRequired));
      return;
    }

    try {
      await runPendingAction({ type: 'rename', mapId: renameTarget.id }, () =>
        renameMap.mutateAsync({ mapId: renameTarget.id, name: trimmedName }),
      );
      setRenameTarget(null);
      setRenameName('');
      setRenameError(null);
    } catch {
      setRenameError(intl.formatMessage(mapMessages.saveError));
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    setDeleteError(null);

    try {
      await runPendingAction({ type: 'delete', mapId: deleteTarget.id }, () =>
        deleteMap.mutateAsync(deleteTarget.id),
      );
      setDeleteTarget(null);
      setDeleteError(null);
    } catch {
      setDeleteError(intl.formatMessage(mapMessages.deleteError));
    }
  }

  function isPending(type: PendingAction['type'], mapId: string) {
    return pendingAction?.type === type && pendingAction.mapId === mapId;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.savedMaps)}
      </h2>

      {activeError ? (
        <p role="alert" className="text-sm text-error">
          {activeError}
        </p>
      ) : null}

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
                  onClick={() => {
                    void handleActiveToggle(map.id, isActive);
                  }}
                  loading={isPending('active', map.id)}
                  disabled={hasPendingAction && !isPending('active', map.id)}
                >
                  {intl.formatMessage(
                    isActive ? mapMessages.removeActive : mapMessages.setActive,
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openRenameDialog(map)}
                  loading={isPending('rename', map.id)}
                  disabled={hasPendingAction && !isPending('rename', map.id)}
                >
                  {intl.formatMessage(mapMessages.rename)}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => openDeleteDialog(map)}
                  loading={isPending('delete', map.id)}
                  disabled={hasPendingAction && !isPending('delete', map.id)}
                >
                  {intl.formatMessage(mapMessages.delete)}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={intl.formatMessage(mapMessages.renameDialogTitle)}
        description={intl.formatMessage(mapMessages.renameDialogDescription)}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRenameSubmit();
          }}
        >
          <Input
            label={intl.formatMessage(mapMessages.renamePrompt)}
            value={renameName}
            onChange={(event) => {
              setRenameName(event.target.value);
              setRenameError(null);
            }}
            error={renameError ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              {intl.formatMessage(mapMessages.cancel)}
            </Button>
            <Button
              type="submit"
              loading={
                renameTarget ? isPending('rename', renameTarget.id) : false
              }
            >
              {intl.formatMessage(mapMessages.renameSave)}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={intl.formatMessage(mapMessages.deleteDialogTitle)}
        description={
          deleteTarget
            ? intl.formatMessage(mapMessages.deleteDialogDescription, {
                name: deleteTarget.name,
              })
            : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {deleteError ? (
            <p role="alert" className="text-sm text-error">
              {deleteError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              {intl.formatMessage(mapMessages.cancel)}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void handleDeleteConfirm();
              }}
              loading={
                deleteTarget ? isPending('delete', deleteTarget.id) : false
              }
            >
              {intl.formatMessage(mapMessages.deleteConfirm)}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

export type { SavedMapsListProps };
