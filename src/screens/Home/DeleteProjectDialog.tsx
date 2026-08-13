import { useReducer } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { removeMapsFromListCaches } from '@/hooks/useMaps';
import { deleteProject } from '@/lib/data-layer';
import { useMapDownloadStore } from '@/stores/map-download-store';
import { useMapStore } from '@/stores/map-store';

interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectLocalId: string;
  projectName: string;
  onClose: () => void;
  onDeleted: () => void;
}

type DialogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string };

type DialogAction =
  | { type: 'submit' }
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

const messages = defineMessages({
  title: {
    id: 'home.deleteProject.title',
    defaultMessage: 'Delete Project',
  },
  confirm: {
    id: 'home.deleteProject.confirm',
    defaultMessage:
      'Are you sure you want to delete "{name}"? This will permanently remove all associated data.',
  },
  cancel: {
    id: 'home.deleteProject.cancel',
    defaultMessage: 'Cancel',
  },
  confirmBtn: {
    id: 'home.deleteProject.confirmBtn',
    defaultMessage: 'Delete',
  },
  failed: {
    id: 'home.deleteProject.error',
    defaultMessage: 'Failed to delete project',
  },
});

function dialogReducer(_state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'submit':
      return { status: 'loading' };
    case 'success':
      return { status: 'idle' };
    case 'error':
      return { status: 'error', message: action.message };
    case 'reset':
      return { status: 'idle' };
  }
}

function DeleteProjectDialog({
  isOpen,
  projectLocalId,
  projectName,
  onClose,
  onDeleted,
}: DeleteProjectDialogProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });

  function handleDelete() {
    dispatch({ type: 'submit' });

    deleteProject(projectLocalId).then(
      (removedMapIds) => {
        const removedMapIdSet = new Set(removedMapIds);
        const downloadStore = useMapDownloadStore.getState();
        const mapStore = useMapStore.getState();

        if (
          downloadStore.active &&
          removedMapIdSet.has(downloadStore.active.mapId)
        ) {
          downloadStore.active.cancel();
          downloadStore.clear(downloadStore.active.mapId);
        }

        if (mapStore.activeProjectLocalId === projectLocalId) {
          mapStore.hydrateActiveMap(null, null);
        } else if (
          mapStore.activeMapId !== null &&
          removedMapIdSet.has(mapStore.activeMapId)
        ) {
          mapStore.hydrateActiveMap(mapStore.activeProjectLocalId, null);
        }

        removeMapsFromListCaches(queryClient, removedMapIds);
        for (const mapId of removedMapIds) {
          queryClient.removeQueries({ queryKey: ['map', mapId], exact: true });
        }
        void queryClient.invalidateQueries({ queryKey: ['maps'] });
        void queryClient.invalidateQueries({ queryKey: ['projects'] });

        dispatch({ type: 'success' });
        onDeleted();
      },
      (err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : intl.formatMessage(messages.failed);
        dispatch({ type: 'error', message });
      },
    );
  }

  function handleClose() {
    dispatch({ type: 'reset' });
    onClose();
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title={intl.formatMessage(messages.title)}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text">
          {intl.formatMessage(messages.confirm, { name: projectName })}
        </p>

        {state.status === 'error' && (
          <p className="text-sm text-error">{state.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={state.status === 'loading'}
          >
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleDelete}
            loading={state.status === 'loading'}
          >
            {intl.formatMessage(messages.confirmBtn)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { DeleteProjectDialog };
export type { DeleteProjectDialogProps };
