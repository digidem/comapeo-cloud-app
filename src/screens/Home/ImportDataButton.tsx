import { useReducer, useRef } from 'react';

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
        const message = err instanceof Error ? err.message : 'Import failed';
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
          Import Data
        </Button>
      )}

      {state.status === 'processing' && (
        <Button variant="secondary" size="sm" loading disabled>
          Processing...
        </Button>
      )}

      {state.status === 'success' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-green-600">
            {state.imported} imported, {state.skipped} skipped
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'reset' })}
          >
            Import another
          </Button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-red-500">Error: {state.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'reset' })}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export { ImportDataButton };
export type { ImportDataButtonProps };
