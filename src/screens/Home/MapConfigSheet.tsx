import * as Dialog from '@radix-ui/react-dialog';

import { type ReactNode, useState } from 'react';

import { CloseIcon } from '@/components/ui/close-icon';
import { SelectPortalProvider } from '@/components/ui/select';

interface MapConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: string;
  closeLabel?: string;
}

function MapConfigSheet({
  open,
  onOpenChange,
  children,
  title,
  closeLabel,
}: MapConfigSheetProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );

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
          <Dialog.Title className="sr-only">{title}</Dialog.Title>

          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div
              data-testid="drag-handle"
              className="h-1 w-10 rounded-full bg-border"
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-end border-b border-border/20 px-5 py-3">
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={closeLabel ?? 'Close'}
              style={{ touchAction: 'manipulation' }}
            >
              <CloseIcon size={20} />
            </Dialog.Close>
          </div>

          {/* Portal target for Select dropdowns — renders here so they are
              inside the Dialog content (avoiding DismissableLayer issues) but
              outside the scrollable area (avoiding overflow clipping). */}
          <div ref={setPortalContainer} />

          {/* Scrollable content */}
          <div
            data-testid="sheet-scrollable"
            className="flex flex-col gap-4 overflow-y-auto p-5"
          >
            <SelectPortalProvider container={portalContainer}>
              {children}
            </SelectPortalProvider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { MapConfigSheet };
export type { MapConfigSheetProps };
