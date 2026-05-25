import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface-card p-6 shadow-modal focus:outline-none w-full max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialog.Title className="text-lg font-semibold text-text">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-text-muted mt-2">
            {description ?? title}
          </AlertDialog.Description>
          {children}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" size="sm">
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={variant} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export type { ConfirmDialogProps };
