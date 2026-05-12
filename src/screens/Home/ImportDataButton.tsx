import { useReducer, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { importGeoJsonPoints } from '@/lib/data-layer';

interface ImportDataButtonProps {
  projectLocalId: string;
  onImportComplete?: (result: { imported: number; skipped: number }) => void;
  iconOnly?: boolean;
  projectName?: string;
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
  iconOnly = false,
  projectName,
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

  // Hidden file input shared by both modes
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".geojson,.json,.zip"
      className="sr-only"
      onChange={handleFileChange}
      aria-hidden="true"
    />
  );

  // Icon-only mode: renders as a small icon button with no text/state feedback
  if (iconOnly) {
    return (
      <>
        {fileInput}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            handleButtonClick();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              handleButtonClick();
            }
          }}
          className="h-6 w-6 rounded-full text-text-muted hover:text-text hover:bg-surface inline-flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Import data into ${projectName ?? 'project'}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
      </>
    );
  }

  // Full mode: renders a button with state feedback
  return (
    <div className="flex flex-col gap-1">
      {fileInput}

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
          <p className="text-sm text-success">
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
          <p className="text-sm text-error">
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
