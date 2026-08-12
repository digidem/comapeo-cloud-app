import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import type { SavedMap } from '@/lib/db';

import { mapMessages } from './messages';

interface RenameMapDialogProps {
  target: SavedMap | null;
  name: string;
  error: string | null;
  loading: boolean;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function RenameMapDialog({
  target,
  name,
  error,
  loading,
  onNameChange,
  onCancel,
  onSubmit,
}: RenameMapDialogProps) {
  const intl = useIntl();

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={intl.formatMessage(mapMessages.renameDialogTitle)}
      description={intl.formatMessage(mapMessages.renameDialogDescription)}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Input
          label={intl.formatMessage(mapMessages.renamePrompt)}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          error={error ?? undefined}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {intl.formatMessage(mapMessages.cancel)}
          </Button>
          <Button type="submit" loading={loading}>
            {intl.formatMessage(mapMessages.renameSave)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface DeleteMapDialogProps {
  target: SavedMap | null;
  error: string | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMapDialog({
  target,
  error,
  loading,
  onCancel,
  onConfirm,
}: DeleteMapDialogProps) {
  const intl = useIntl();

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={intl.formatMessage(mapMessages.deleteDialogTitle)}
      description={
        target
          ? intl.formatMessage(mapMessages.deleteDialogDescription, {
              name: target.name,
            })
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {intl.formatMessage(mapMessages.cancel)}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {intl.formatMessage(mapMessages.deleteConfirm)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
