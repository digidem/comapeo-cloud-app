import * as Dialog from '@radix-ui/react-dialog';
import * as v from 'valibot';

import { useCallback, useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { getCategorySet, importCategorySet } from '@/lib/categories-db';
import { comapeoCatSchema } from '@/lib/schemas/preset';

const messages = defineMessages({
  title: {
    id: 'categories.importSet.title',
    defaultMessage: 'Import Category Set',
  },
  description: {
    id: 'categories.importSet.description',
    defaultMessage: 'Upload a .comapeocat file to import a category set.',
  },
  fileLabel: {
    id: 'categories.importSet.fileLabel',
    defaultMessage: 'Choose .comapeocat file',
  },
  invalidJson: {
    id: 'categories.importSet.invalidJson',
    defaultMessage: 'Invalid JSON: {error}',
  },
  validationError: {
    id: 'categories.importSet.validationError',
    defaultMessage: 'Validation error: {error}',
  },
  imported: {
    id: 'categories.importSet.imported',
    defaultMessage: 'Category set "{name}" imported successfully.',
  },
  replaceTitle: {
    id: 'categories.importSet.replaceTitle',
    defaultMessage: 'Replace existing set?',
  },
  replaceDescription: {
    id: 'categories.importSet.replaceDescription',
    defaultMessage:
      'A set with ID "{setId}" already exists. Importing will replace it.',
  },
  confirmReplace: {
    id: 'categories.importSet.confirmReplace',
    defaultMessage: 'Replace',
  },
  cancel: {
    id: 'categories.importSet.cancel',
    defaultMessage: 'Cancel',
  },
  importButton: {
    id: 'categories.importSet.importButton',
    defaultMessage: 'Import',
  },
  errorAnnouncement: {
    id: 'categories.importSet.errorAnnouncement',
    defaultMessage: 'Import failed',
  },
  failedToRead: {
    id: 'categories.importSet.failedToRead',
    defaultMessage: 'Failed to read file',
  },
  importError: {
    id: 'categories.importSet.importError',
    defaultMessage: 'Failed to import: {error}',
  },
  successAnnouncement: {
    id: 'categories.importSet.successAnnouncement',
    defaultMessage: 'Import succeeded',
  },
});

interface ImportSetDialogProps {
  open: boolean;
  onClose: () => void;
}

type DialogState =
  | { status: 'idle' }
  | { status: 'confirming-replace'; setId: string; name: string; data: unknown }
  | { status: 'success'; name: string }
  | { status: 'error'; message: string };

function ImportSetDialog({ open, onClose }: ImportSetDialogProps) {
  const intl = useIntl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<DialogState>({
    status: 'idle',
  });

  const reset = useCallback(() => {
    setDialogState({ status: 'idle' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset();
        onClose();
      }
    },
    [onClose, reset],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      let text: string;
      try {
        text = await file.text();
      } catch {
        setDialogState({
          status: 'error',
          message: intl.formatMessage(messages.failedToRead),
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDialogState({
          status: 'error',
          message: intl.formatMessage(messages.invalidJson, { error: msg }),
        });
        return;
      }

      const result = v.safeParse(comapeoCatSchema, parsed);
      if (!result.success) {
        const firstIssue = result.issues[0];
        const msg = firstIssue
          ? `${firstIssue.message} at ${firstIssue.path?.map((p) => p.key ?? p.value).join('.')}`
          : 'Unknown error';
        setDialogState({
          status: 'error',
          message: intl.formatMessage(messages.validationError, { error: msg }),
        });
        return;
      }

      const setId = file.name.replace(/\.comapeocat$/i, '');
      const name = result.output.metadata?.name ?? setId;

      // Check for existing set
      try {
        const existing = await getCategorySet(setId);
        if (existing) {
          setDialogState({
            status: 'confirming-replace',
            setId,
            name,
            data: parsed,
          });
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDialogState({
          status: 'error',
          message: intl.formatMessage(messages.importError, { error: msg }),
        });
        return;
      }

      try {
        await importCategorySet(setId, name, parsed);
        setDialogState({ status: 'success', name });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDialogState({
          status: 'error',
          message: intl.formatMessage(messages.importError, { error: msg }),
        });
      }
    },
    [intl, handleClose],
  );

  const handleConfirmReplace = useCallback(async () => {
    if (dialogState.status !== 'confirming-replace') return;
    const { setId, name, data } = dialogState;
    try {
      await importCategorySet(setId, name, data);
      setDialogState({ status: 'success', name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDialogState({
        status: 'error',
        message: intl.formatMessage(messages.importError, { error: msg }),
      });
    }
  }, [dialogState, handleClose, intl]);

  // Auto-close on success with cleanup on unmount
  useEffect(() => {
    if (dialogState.status !== 'success') return;
    const timer = setTimeout(() => handleClose(false), 1500);
    return () => clearTimeout(timer);
  }, [dialogState.status, handleClose]);

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface-card p-6 shadow-modal focus:outline-none w-full max-w-md max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-text">
              {intl.formatMessage(messages.title)}
            </Dialog.Title>
            <Dialog.Close
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={intl.formatMessage(messages.cancel)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-text-muted mb-4">
            {intl.formatMessage(messages.description)}
          </Dialog.Description>

          {/* ARIA live region for screen reader announcements */}
          <div aria-live="assertive" className="sr-only">
            {dialogState.status === 'success' &&
              intl.formatMessage(messages.successAnnouncement)}
            {dialogState.status === 'error' &&
              intl.formatMessage(messages.errorAnnouncement)}
          </div>

          {dialogState.status === 'idle' && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text">
                  {intl.formatMessage(messages.fileLabel)}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".comapeocat"
                  onChange={handleFileChange}
                  className="rounded-button border border-border bg-surface px-3 py-2 text-sm text-text file:mr-3 file:rounded-button file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white file:cursor-pointer hover:file:bg-primary-hover"
                />
              </label>
            </div>
          )}

          {dialogState.status === 'confirming-replace' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text">
                {intl.formatMessage(messages.replaceDescription, {
                  setId: dialogState.setId,
                })}
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={reset}>
                  {intl.formatMessage(messages.cancel)}
                </Button>
                <Button variant="danger" onClick={handleConfirmReplace}>
                  {intl.formatMessage(messages.confirmReplace)}
                </Button>
              </div>
            </div>
          )}

          {dialogState.status === 'success' && (
            <p className="text-sm text-green-600" role="status">
              {intl.formatMessage(messages.imported, {
                name: dialogState.name,
              })}
            </p>
          )}

          {dialogState.status === 'error' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-error" role="alert">
                {dialogState.message}
              </p>
              <Button variant="ghost" onClick={reset}>
                {intl.formatMessage(messages.cancel)}
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { ImportSetDialog };
export type { ImportSetDialogProps };
