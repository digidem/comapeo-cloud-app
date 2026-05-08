import { useReducer, useRef } from 'react';

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
          err instanceof Error ? err.message : 'Failed to create project';
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
      title="New Project"
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
            Project Name
          </label>
          <input
            id="project-name"
            ref={inputRef}
            type="text"
            placeholder="Enter project name"
            defaultValue=""
            className="w-full rounded-[12px] border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        {state.status === 'error' && (
          <p className="text-sm text-red-500">{state.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={state.status === 'loading'}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { CreateProjectDialog };
export type { CreateProjectDialogProps };
