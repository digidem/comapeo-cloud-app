import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useState } from 'react';

import { Modal } from '@/components/ui/modal';

function ModalDemo({
  title = 'Confirm Action',
  description = 'Are you sure you want to proceed? This action cannot be undone.',
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
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
        Reopen Modal
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
      >
        {children}
      </Modal>
    </div>
  );
}

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

/** Modal open with title, description, and close button */
export const Default: Story = {
  render: () => <ModalDemo />,
};

/** Modal with title only, no description text */
export const WithoutDescription: Story = {
  render: () => (
    <ModalDemo title="Delete Item?" description={undefined}>
      <p style={{ color: '#172033', fontSize: 14 }}>
        This item will be permanently removed.
      </p>
    </ModalDemo>
  ),
};

/** Modal with scrollable long content to demonstrate max-h-[90vh] overflow-y-auto */
export const WithLongContent: Story = {
  render: () => (
    <ModalDemo title="Terms of Service" description="Please read carefully">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <p
            key={i}
            style={{ color: '#172033', fontSize: 14, lineHeight: 1.6 }}
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat. Duis aute irure dolor in
            reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
            pariatur.
          </p>
        ))}
      </div>
    </ModalDemo>
  ),
};

/** Destructive variant with a red danger button */
export const DestructiveVariant: Story = {
  render: () => (
    <ModalDemo
      title="Clear All Data?"
      description="This will permanently remove all local settings and cached data."
    >
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            background: 'transparent',
            color: '#172033',
            border: '1px solid #D9DEE8',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            background: '#DC2626',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Yes, Clear Everything
        </button>
      </div>
    </ModalDemo>
  ),
};
