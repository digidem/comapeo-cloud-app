import { useReducer, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { importGeoJsonPoints } from '@/lib/data-layer';

interface ImportDataButtonProps {
  projectLocalId: string;
  onImportComplete?: (result: { imported: number; skipped: number }) => void;
}

type ImportState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'success'; imported: number; skipped: number }
  | { status: 'error'; message: string };

type ImportAction =
  | { type: 'start' }
  | { type: 'success'; imported: number; skipped: number }
  | { type: 'error'; message: string }
  | { type: 'reset' };

const messages = defineMessages({
  importButton: {
    id: 'home.import.button',
    defaultMessage: 'Import Data',
  },
  processing: {
    id: 'home.import.processing',
    defaultMessage: 'Processing...',
  },
  success: {
    id: 'home.import.successWithSkipped',
    defaultMessage: '{imported} imported, {skipped} skipped',
  },
  importAnother: {
    id: 'home.import.another',
    defaultMessage: 'Import another',
  },
  errorPrefix: {
    id: 'home.import.errorPrefix',
    defaultMessage: 'Error: {message}',
  },
  failed: {
    id: 'home.import.error',
    defaultMessage: 'Import failed',
  },
  tryAgain: {
    id: 'home.import.tryAgain',
    defaultMessage: 'Try again',
  },
});

function importReducer(_state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'start':
      return { status: 'processing' };
    case 'success':
      return {
        status: 'success',
        imported: action.imported,
        skipped: action.skipped,
      };
    case 'error':
      return { status: 'error', message: action.message };
    case 'reset':
      return { status: 'idle' };
  }
}

function ImportDataButton({
  projectLocalId,
  onImportComplete,
}: ImportDataButtonProps) {
  const intl = useIntl();
  const [state, dispatch] = useReducer(importReducer, { status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    dispatch({ type: 'start' });

    importGeoJsonPoints(projectLocalId, file).then(
      (result) => {
        dispatch({
          type: 'success',
          imported: result.imported,
          skipped: result.skipped,
        });
        onImportComplete?.(result);
      },
      (err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : intl.formatMessage(messages.failed);
        dispatch({ type: 'error', message });
      },
    );

    event.target.value = '';
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.zip"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {state.status === 'idle' && (
        <Button variant="secondary" size="sm" onClick={handleButtonClick}>
          {intl.formatMessage(messages.importButton)}
        </Button>
      )}

      {state.status === 'processing' && (
        <Button variant="secondary" size="sm" loading disabled>
          {intl.formatMessage(messages.processing)}
        </Button>
      )}

      {state.status === 'success' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-green-600">
            {intl.formatMessage(messages.success, {
              imported: state.imported,
              skipped: state.skipped,
            })}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'reset' })}
          >
            {intl.formatMessage(messages.importAnother)}
          </Button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-red-500">
            {intl.formatMessage(messages.errorPrefix, {
              message: state.message,
            })}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'reset' })}
          >
            {intl.formatMessage(messages.tryAgain)}
          </Button>
        </div>
      )}
    </div>
  );
}

export { ImportDataButton };
export type { ImportDataButtonProps };
