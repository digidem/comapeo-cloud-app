import * as Dialog from '@radix-ui/react-dialog';

import { type ReactNode } from 'react';

import { CloseIcon } from '@/components/ui/close-icon';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface-card p-6 shadow-modal focus:outline-none w-full max-w-md max-h-[90vh] overflow-y-auto"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-text">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close"
            >
              <CloseIcon size={15} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="text-sm text-text-muted mb-4">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Modal };
export type { ModalProps };
