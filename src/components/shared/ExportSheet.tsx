import * as Dialog from '@radix-ui/react-dialog';

import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  sheetTitle: {
    id: 'data.exportSheet.title',
    defaultMessage: 'Export Observations',
  },
  geojson: {
    id: 'data.exportSheet.geojson',
    defaultMessage: 'GeoJSON',
  },
  geojsonDescription: {
    id: 'data.exportSheet.geojsonDescription',
    defaultMessage: 'Geographic data for mapping tools',
  },
  csv: {
    id: 'data.exportSheet.csv',
    defaultMessage: 'CSV',
  },
  csvDescription: {
    id: 'data.exportSheet.csvDescription',
    defaultMessage: 'Spreadsheet-compatible rows and columns',
  },
  closeSheet: {
    id: 'data.exportSheet.close',
    defaultMessage: 'Close',
  },
});

interface ExportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportGeoJson: () => Promise<void>;
  onExportCsv: () => Promise<void>;
}

function ExportSheet({
  open,
  onOpenChange,
  onExportGeoJson,
  onExportCsv,
}: ExportSheetProps) {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);

  function handleAction(action: () => Promise<void>) {
    return async () => {
      setLoading(true);
      try {
        await action();
      } finally {
        setLoading(false);
        onOpenChange(false);
      }
    };
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 150ms ease-out',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-[51] flex max-h-[85vh] flex-col rounded-t-card bg-surface-card shadow-elevated focus:outline-none"
          style={{
            animation: 'slideUp 200ms ease-out',
          }}
        >
          <Dialog.Title className="sr-only">
            {intl.formatMessage(messages.sheetTitle)}
          </Dialog.Title>

          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div
              aria-hidden="true"
              className="h-1 w-10 rounded-full bg-border"
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/20 px-5 py-3">
            <span className="text-sm font-semibold text-text">
              {intl.formatMessage(messages.sheetTitle)}
            </span>
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={intl.formatMessage(messages.closeSheet)}
              style={{ touchAction: 'manipulation' }}
            >
              <svg
                width="20"
                height="20"
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

          {/* Action list */}
          <div className="flex flex-col overflow-y-auto p-2">
            {/* GeoJSON */}
            <button
              type="button"
              onClick={handleAction(onExportGeoJson)}
              disabled={loading}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-3 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none"
            >
              {/* Globe icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-text-muted"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text">
                  {intl.formatMessage(messages.geojson)}
                </span>
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.geojsonDescription)}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
                .geojson
              </span>
            </button>

            {/* CSV */}
            <button
              type="button"
              onClick={handleAction(onExportCsv)}
              disabled={loading}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-3 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none"
            >
              {/* Table icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-text-muted"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text">
                  {intl.formatMessage(messages.csv)}
                </span>
                <span className="text-xs text-text-muted">
                  {intl.formatMessage(messages.csvDescription)}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
                .csv
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { ExportSheet };
export type { ExportSheetProps };
