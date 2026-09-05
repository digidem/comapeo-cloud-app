import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { Skeleton } from '@/components/ui/skeleton';
import {
  useAllMaps,
  useDeleteMap,
  useMaps,
  useRenameMap,
  useSetActiveMapMutation,
} from '@/hooks/useMaps';
import { useProjects } from '@/hooks/useProjects';
import type { SavedMap } from '@/lib/db';
import { useMapStore } from '@/stores/map-store';

import { DeleteMapDialog, RenameMapDialog } from './SavedMapDialogs';
import { SavedMapRow } from './SavedMapRow';
import {
  type SavedMapsScope,
  SavedMapsScopeToggle,
} from './SavedMapsScopeToggle';
import { SmpPreviewDialog } from './SmpPreviewDialog';
import { mapMessages } from './messages';

interface SavedMapsListProps {
  projectLocalId: string | null;
  onEditMap?: (map: SavedMap) => void;
}

type PendingAction =
  | { type: 'active'; mapId: string }
  | { type: 'rename'; mapId: string }
  | { type: 'delete'; mapId: string };

export function SavedMapsList({
  projectLocalId,
  onEditMap,
}: SavedMapsListProps) {
  const intl = useIntl();
  const activeMapId = useMapStore((state) => state.activeMapId);
  const [scope, setScope] = useState<SavedMapsScope>('project');
  const projectMapsQuery = useMaps(projectLocalId, scope === 'project');
  const allMapsQuery = useAllMaps(scope === 'all');
  const projectsQuery = useProjects();
  const setActiveMap = useSetActiveMapMutation();
  const renameMap = useRenameMap();
  const deleteMap = useDeleteMap();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<SavedMap | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedMap | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);

  const mapsQuery = scope === 'all' ? allMapsQuery : projectMapsQuery;
  const maps = mapsQuery.data ?? [];
  const isMapsPending =
    mapsQuery.isPending || (scope === 'all' && projectsQuery.isPending);
  const originProjectNameById = useMemo(() => {
    const names = new Map<string, string>();
    const untitledProject = intl.formatMessage(mapMessages.untitledProject);

    for (const project of projectsQuery.data ?? []) {
      if (project.deleted) continue;
      names.set(project.localId, project.name?.trim() || untitledProject);
    }

    return names;
  }, [intl, projectsQuery.data]);
  const previewTarget = previewTargetId
    ? (maps.find((map) => map.id === previewTargetId) ?? null)
    : null;
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
    setActiveError(null);
    setRenameTarget(map);
    setRenameName(map.name);
    setRenameError(null);
  }

  function openDeleteDialog(map: SavedMap) {
    setActiveError(null);
    setDeleteTarget(map);
    setDeleteError(null);
  }

  async function handleActiveToggle(mapId: string, isActive: boolean) {
    setActiveError(null);
    const targetProjectLocalId = projectLocalId;
    if (!targetProjectLocalId) return;

    try {
      await runPendingAction({ type: 'active', mapId }, () =>
        setActiveMap.mutateAsync({
          targetProjectLocalId,
          mapId: isActive ? null : mapId,
        }),
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
      if (previewTargetId === deleteTarget.id) setPreviewTargetId(null);
      setDeleteTarget(null);
      setDeleteError(null);
    } catch {
      setDeleteError(intl.formatMessage(mapMessages.deleteError));
    }
  }

  function pendingActionTypeFor(mapId: string) {
    return pendingAction?.mapId === mapId ? pendingAction.type : null;
  }

  function renderMapResults() {
    if (isMapsPending) {
      return (
        <>
          <Skeleton height={80} className="rounded-card" />
          <Skeleton height={80} className="rounded-card" />
        </>
      );
    }

    if (maps.length === 0) {
      return (
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">
          {intl.formatMessage(mapMessages.savedMapsEmpty)}
        </p>
      );
    }

    return maps.map((map) => {
      const isActive = activeMapId === map.id;
      return (
        <SavedMapRow
          key={map.id}
          map={map}
          scope={scope}
          originProjectName={originProjectNameById.get(map.projectLocalId)}
          isActive={isActive}
          pendingActionType={pendingActionTypeFor(map.id)}
          hasPendingAction={hasPendingAction}
          onActiveToggle={() => {
            void handleActiveToggle(map.id, isActive);
          }}
          onPreview={() => setPreviewTargetId(map.id)}
          onEdit={() => onEditMap?.(map)}
          onRename={() => openRenameDialog(map)}
          onDelete={() => openDeleteDialog(map)}
        />
      );
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.savedMaps)}
      </h2>

      <SavedMapsScopeToggle
        scope={scope}
        disabled={hasPendingAction}
        onScopeChange={setScope}
      />

      {activeError ? (
        <p role="alert" className="text-sm text-error">
          {activeError}
        </p>
      ) : null}

      <div
        data-testid="saved-maps-results"
        className="flex flex-col gap-2"
        aria-live="polite"
        aria-busy={isMapsPending}
      >
        {renderMapResults()}
      </div>

      <RenameMapDialog
        target={renameTarget}
        name={renameName}
        error={renameError}
        loading={
          renameTarget
            ? pendingActionTypeFor(renameTarget.id) === 'rename'
            : false
        }
        onNameChange={(name) => {
          setRenameName(name);
          setRenameError(null);
        }}
        onCancel={() => setRenameTarget(null)}
        onSubmit={() => {
          void handleRenameSubmit();
        }}
      />

      <SmpPreviewDialog
        open={previewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewTargetId(null);
        }}
        map={previewTarget}
      />

      <DeleteMapDialog
        target={deleteTarget}
        error={deleteError}
        loading={
          deleteTarget
            ? pendingActionTypeFor(deleteTarget.id) === 'delete'
            : false
        }
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />
    </section>
  );
}

export type { SavedMapsListProps };
