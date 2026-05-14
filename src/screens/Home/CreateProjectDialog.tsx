import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useReducer } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { createProject } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (projectLocalId: string) => void;
  serverUrl?: string;
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
  archiveLabel: {
    id: 'home.newProject.dialog.archiveLabel',
    defaultMessage: 'Remote Archive',
  },
  archivePlaceholder: {
    id: 'home.newProject.dialog.archivePlaceholder',
    defaultMessage: 'Select remote archive',
  },
  archiveOptionLocal: {
    id: 'home.newProject.dialog.archiveOptionLocal',
    defaultMessage: 'Local (offline)',
  },
  descriptionLabel: {
    id: 'home.newProject.dialog.descriptionLabel',
    defaultMessage: 'Description',
  },
  descriptionPlaceholder: {
    id: 'home.newProject.dialog.descriptionPlaceholder',
    defaultMessage: 'Short description of the project',
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

const LOCAL_SERVER_VALUE = '__local__';
const formSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  serverUrl: v.optional(
    v.pipe(
      v.string(),
      v.transform((val) => (val === LOCAL_SERVER_VALUE ? '' : val)),
    ),
  ),
});
type FormData = v.InferInput<typeof formSchema>;

function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
  serverUrl: _serverUrl,
}: CreateProjectDialogProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(dialogReducer, { status: 'idle' });
  const servers = useAuthStore((s) => s.servers);

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      serverUrl: _serverUrl ?? LOCAL_SERVER_VALUE,
    },
  });

  const selectedServerUrl = watch('serverUrl');

  function onSubmit(data: FormData) {
    dispatch({ type: 'submit' });

    createProject({
      name: data.name,
      description: data.description,
      serverUrl: data.serverUrl || undefined,
    }).then(
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
    reset({
      name: '',
      description: '',
      serverUrl: _serverUrl ?? LOCAL_SERVER_VALUE,
    });
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
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="project-name"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.nameLabel)}
          </label>
          <input
            id="project-name"
            type="text"
            placeholder={intl.formatMessage(messages.namePlaceholder)}
            className="w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
            {...register('name')}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="project-description"
            className="text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.descriptionLabel)}
          </label>
          <input
            id="project-description"
            type="text"
            placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
            className="w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
            {...register('description')}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text">
            {intl.formatMessage(messages.archiveLabel)}
          </label>
          <Select
            value={selectedServerUrl}
            onValueChange={(value) => setValue('serverUrl', value)}
            placeholder={intl.formatMessage(messages.archivePlaceholder)}
          >
            <Select.Item value={LOCAL_SERVER_VALUE}>
              {intl.formatMessage(messages.archiveOptionLocal)}
            </Select.Item>
            {servers.map((server) => (
              <Select.Item key={server.id} value={server.baseUrl}>
                {server.label}
              </Select.Item>
            ))}
          </Select>
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
