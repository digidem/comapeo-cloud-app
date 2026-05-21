import * as Dialog from '@radix-ui/react-dialog';

import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  sheetTitle: {
    id: 'archiveOverflow.sheetTitle',
    defaultMessage: 'Actions for {name}',
  },
  viewDetails: {
    id: 'archiveOverflow.viewDetails',
    defaultMessage: 'View Details',
  },
  editArchive: {
    id: 'archiveOverflow.editArchive',
    defaultMessage: 'Edit Archive',
  },
  syncNow: {
    id: 'archiveOverflow.syncNow',
    defaultMessage: 'Sync Now',
  },
  copyUrl: {
    id: 'archiveOverflow.copyUrl',
    defaultMessage: 'Copy URL',
  },
  removeArchive: {
    id: 'archiveOverflow.removeArchive',
    defaultMessage: 'Remove Archive',
  },
  closeSheet: {
    id: 'archiveOverflow.closeSheet',
    defaultMessage: 'Close',
  },
});

interface ArchiveOverflowSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archiveName: string;
  onEdit: () => void;
  onSync: () => void;
  onCopyUrl: () => void;
  onRemove: () => void;
  onViewDetails: () => void;
}

function ArchiveOverflowSheet({
  open,
  onOpenChange,
  archiveName,
  onEdit,
  onSync,
  onCopyUrl,
  onRemove,
  onViewDetails,
}: ArchiveOverflowSheetProps) {
  const intl = useIntl();

  function handleClose() {
    onOpenChange(false);
  }

  function handleAction(action: () => void) {
    action();
    handleClose();
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
            {intl.formatMessage(messages.sheetTitle, { name: archiveName })}
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
            <span className="text-sm font-semibold text-text truncate">
              {archiveName}
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
            {/* View Details */}
            <button
              type="button"
              onClick={() => handleAction(onViewDetails)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Chevron-right icon */}
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
                <path d="m9 18 6-6-6-6" />
              </svg>
              {intl.formatMessage(messages.viewDetails)}
            </button>

            {/* Edit Archive */}
            <button
              type="button"
              onClick={() => handleAction(onEdit)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Pencil icon */}
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
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              {intl.formatMessage(messages.editArchive)}
            </button>

            {/* Sync Now */}
            <button
              type="button"
              onClick={() => handleAction(onSync)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Sync/circular icon */}
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
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              {intl.formatMessage(messages.syncNow)}
            </button>

            {/* Copy URL */}
            <button
              type="button"
              onClick={() => handleAction(onCopyUrl)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Copy icon */}
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
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              {intl.formatMessage(messages.copyUrl)}
            </button>

            {/* Remove Archive — separated with border-top, danger color */}
            <div className="border-t border-border mt-1 pt-1">
              <button
                type="button"
                onClick={() => handleAction(onRemove)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                {/* Trash/remove icon */}
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
                  className="shrink-0"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                {intl.formatMessage(messages.removeArchive)}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { ArchiveOverflowSheet };
export type { ArchiveOverflowSheetProps };
