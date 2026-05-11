import { useReducer, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import type { RemoteArchiveServer } from '@/stores/auth-store';
import { useAuthStore } from '@/stores/auth-store';

interface EditArchiveServerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  server: RemoteArchiveServer;
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
    id: 'home.archive.editDialog.title',
    defaultMessage: 'Edit Archive Server',
  },
  label: {
    id: 'home.archive.dialog.label',
    defaultMessage: 'Label (optional)',
  },
  labelPlaceholder: {
    id: 'home.archive.dialog.labelPlaceholder',
    defaultMessage: 'e.g. Production Server',
  },
  url: {
    id: 'home.archive.dialog.url',
    defaultMessage: 'Server URL',
  },
  urlPlaceholder: {
    id: 'home.archive.dialog.urlPlaceholder',
    defaultMessage: 'https://archive.example.com',
  },
  token: {
    id: 'home.archive.dialog.token',
    defaultMessage: 'Bearer Token',
  },
  tokenPlaceholder: {
    id: 'home.archive.dialog.tokenPlaceholder',
    defaultMessage: 'Enter bearer token',
  },
  save: {
    id: 'home.archive.editDialog.save',
    defaultMessage: 'Save',
  },
  cancel: {
    id: 'home.archive.dialog.cancel',
    defaultMessage: 'Cancel',
  },
  failed: {
    id: 'home.archive.editDialog.error',
    defaultMessage: 'Failed to update server',
  },
  urlRequired: {
    id: 'home.archive.dialog.urlRequired',
    defaultMessage: 'Server URL is required',
  },
  tokenRequired: {
    id: 'home.archive.dialog.tokenRequired',
    defaultMessage: 'Bearer Token is required',
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

function EditArchiveServerDialog({
  isOpen,
  onClose,
  server,
}: EditArchiveServerDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const labelRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const url = urlRef.current?.value?.trim() ?? '';
    const token = tokenRef.current?.value?.trim() ?? '';
    const label = labelRef.current?.value?.trim() ?? '';

    if (!url) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages.urlRequired),
      });
      return;
    }
    if (!token) {
      dispatch({
        type: 'error',
        message: intl.formatMessage(messages.tokenRequired),
      });
      return;
    }

    dispatch({ type: 'submit' });

    const updateServer = useAuthStore.getState().updateServer;
    updateServer(server.id, {
      label: label || url,
      baseUrl: url,
      token,
    }).then(
      () => {
        dispatch({ type: 'success' });
        onClose();
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <Input
          ref={labelRef}
          label={intl.formatMessage(messages.label)}
          type="text"
          placeholder={intl.formatMessage(messages.labelPlaceholder)}
          defaultValue={server.label}
        />
        <Input
          ref={urlRef}
          label={intl.formatMessage(messages.url)}
          type="text"
          placeholder={intl.formatMessage(messages.urlPlaceholder)}
          defaultValue={server.baseUrl}
        />
        <Input
          ref={tokenRef}
          label={intl.formatMessage(messages.token)}
          type="password"
          placeholder={intl.formatMessage(messages.tokenPlaceholder)}
          defaultValue={server.token}
        />

        {state.status === 'error' && (
          <p className="text-sm text-error">{state.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
          >
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={state.status === 'loading'}
          >
            {intl.formatMessage(messages.save)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { EditArchiveServerDialog };
export type { EditArchiveServerDialogProps };
