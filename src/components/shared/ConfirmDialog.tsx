import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type ConfirmDialogVariant = 'destructive' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  /** Optional extra content rendered between description and buttons */
  children?: ReactNode;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant = 'default',
  loading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface-card p-6 shadow-modal focus:outline-none w-full max-w-md max-h-[90vh] overflow-y-auto"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <AlertDialog.Title className="text-lg font-semibold text-text mb-2">
            {title}
          </AlertDialog.Title>

          {description && (
            <AlertDialog.Description className="text-sm text-text-muted mb-4">
              {description}
            </AlertDialog.Description>
          )}

          {children}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary" size="sm">
                {cancelLabel ?? 'Cancel'}
              </Button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={variant === 'destructive' ? 'danger' : 'primary'}
                size="sm"
                onClick={onConfirm}
                loading={loading}
                disabled={loading}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps, ConfirmDialogVariant };
