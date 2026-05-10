import { useReducer, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { createProject } from '@/lib/data-layer';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (projectLocalId: string) => void;
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
    id: 'home.newProject.dialog.title',
    defaultMessage: 'New Project',
  },
  nameLabel: {
    id: 'home.newProject.dialog.nameLabel',
    defaultMessage: 'Project Name',
  },
  namePlaceholder: {
    id: 'home.newProject.dialog.namePlaceholder',
    defaultMessage: 'Enter project name',
  },
  create: {
    id: 'home.newProject.dialog.create',
    defaultMessage: 'Create',
  },
  cancel: {
    id: 'home.newProject.dialog.cancel',
    defaultMessage: 'Cancel',
  },
  failed: {
    id: 'home.newProject.dialog.error',
    defaultMessage: 'Failed to create project',
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

function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCreate() {
    const name = inputRef.current?.value ?? '';
    dispatch({ type: 'submit' });

    createProject({ name }).then(
      (project) => {
        dispatch({ type: 'success' });
        onCreated(project.localId);
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
          handleCreate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="project-name"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.nameLabel)}
          </label>
          <input
            id="project-name"
            ref={inputRef}
            type="text"
            placeholder={intl.formatMessage(messages.namePlaceholder)}
            defaultValue=""
            className="w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
          />
        </div>

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
            {intl.formatMessage(messages.create)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { CreateProjectDialog };
export type { CreateProjectDialogProps };
