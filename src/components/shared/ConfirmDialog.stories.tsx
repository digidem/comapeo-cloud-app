import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useState } from 'react';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

function ConfirmDialogDemo({
  title = 'Confirm Action',
  description = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmLabel = 'Confirm',
  variant = 'default' as const,
}: {
  title?: string;
  description?: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F4F6FA',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          background: '#1F6FFF',
          color: '#fff',
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Open Confirm Dialog
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onConfirm={() => {
          console.log('confirmed');
          setOpen(false);
        }}
        variant={variant}
      />
    </div>
  );
}

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

/** Dialog open with title, description, confirm and cancel buttons */
export const Default: Story = {
  render: () => <ConfirmDialogDemo />,
};

/** Destructive variant — red confirm button for dangerous actions like clearing data */
export const Destructive: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Clear All Data?"
      description="This will permanently remove all local settings, preferences, and cached data. This action cannot be undone."
      confirmLabel="Yes, Clear Everything"
      variant="destructive"
    />
  ),
};

/** Minimal dialog with just a title and action buttons, no description */
export const WithoutDescription: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Delete Item?"
      confirmLabel="Delete"
      variant="destructive"
      description={''}
    />
  ),
};
