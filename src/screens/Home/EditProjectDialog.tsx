import { useReducer, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { updateProject } from '@/lib/data-layer';

interface EditProjectDialogProps {
  isOpen: boolean;
  projectLocalId: string;
  currentName: string;
  currentDescription?: string;
  onClose: () => void;
  onSaved: () => void;
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
    id: 'home.editProject.title',
    defaultMessage: 'Edit Project',
  },
  nameLabel: {
    id: 'home.newProject.dialog.nameLabel',
    defaultMessage: 'Project Name',
  },
  namePlaceholder: {
    id: 'home.newProject.dialog.namePlaceholder',
    defaultMessage: 'Enter project name',
  },
  descriptionLabel: {
    id: 'home.editProject.descriptionLabel',
    defaultMessage: 'Description',
  },
  descriptionPlaceholder: {
    id: 'home.editProject.descriptionPlaceholder',
    defaultMessage: 'Short description of the project',
  },
  save: {
    id: 'home.editProject.save',
    defaultMessage: 'Save',
  },
  cancel: {
    id: 'home.newProject.dialog.cancel',
    defaultMessage: 'Cancel',
  },
  failed: {
    id: 'home.editProject.error',
    defaultMessage: 'Failed to update project',
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

function EditProjectDialog({
  isOpen,
  projectLocalId,
  currentName,
  currentDescription,
  onClose,
  onSaved,
}: EditProjectDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const name = inputRef.current?.value ?? '';
    if (!name.trim()) return;
    dispatch({ type: 'submit' });

    const description = descriptionRef.current?.value?.trim() ?? '';
    updateProject(projectLocalId, { name, description }).then(
      () => {
        dispatch({ type: 'success' });
        onSaved();
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
          handleSave();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-project-name"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.nameLabel)}
          </label>
          <input
            id="edit-project-name"
            ref={inputRef}
            type="text"
            placeholder={intl.formatMessage(messages.namePlaceholder)}
            defaultValue={currentName}
            className="w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-project-description"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.descriptionLabel)}
          </label>
          <input
            id="edit-project-description"
            ref={descriptionRef}
            type="text"
            placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
            defaultValue={currentDescription ?? ''}
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
            {intl.formatMessage(messages.save)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { EditProjectDialog };
export type { EditProjectDialogProps };
