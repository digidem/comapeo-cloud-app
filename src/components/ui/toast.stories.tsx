import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ToastProvider, useToast } from '@/components/ui/toast';

function ToastDemo({
  variant = 'info',
  title = 'Toast title',
  description,
}: {
  variant?: 'info' | 'success' | 'error';
  title?: string;
  description?: string;
}) {
  return (
    <ToastProvider>
      <div
        style={{
          minHeight: '100vh',
          background: '#F4F6FA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <TriggerButton
          variant={variant}
          title={title}
          description={description}
        />
      </div>
    </ToastProvider>
  );
}

function TriggerButton({
  variant,
  title,
  description,
}: {
  variant: 'info' | 'success' | 'error';
  title: string;
  description?: string;
}) {
  const { addToast } = useToast();

  return (
    <button
      type="button"
      onClick={() => {
        addToast({ variant, title, description, duration: 999999 });
      }}
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
      Show {variant} toast
    </button>
  );
}

function StackedToastsDemo() {
  return (
    <ToastProvider>
      <div
        style={{
          minHeight: '100vh',
          background: '#F4F6FA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <StackedTriggerButton />
      </div>
    </ToastProvider>
  );
}

function StackedTriggerButton() {
  const { addToast } = useToast();

  return (
    <button
      type="button"
      onClick={() => {
        addToast({
          variant: 'success',
          title: 'Export complete',
          description: 'Your file has been downloaded.',
          duration: 999999,
        });
        addToast({
          variant: 'info',
          title: 'Sync finished',
          description: 'All data is up to date.',
          duration: 999999,
        });
      }}
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
      Show stacked toasts
    </button>
  );
}

const meta: Meta = {
  title: 'Components/Toast',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

/** Info toast with blue styling */
export const InfoToast: Story = {
  render: () => (
    <ToastDemo
      variant="info"
      title="Information"
      description="This is an informational message."
    />
  ),
};

/** Success toast with green styling */
export const SuccessToast: Story = {
  render: () => (
    <ToastDemo
      variant="success"
      title="Success"
      description="Operation completed successfully."
    />
  ),
};

/** Error toast with red styling */
export const ErrorToast: Story = {
  render: () => (
    <ToastDemo
      variant="error"
      title="Error"
      description="Something went wrong. Please try again."
    />
  ),
};

/** Toast with both title and description */
export const WithDescription: Story = {
  render: () => (
    <ToastDemo
      variant="info"
      title="New update available"
      description="Version 2.0 is ready to install. Restart to apply changes."
    />
  ),
};

/** Two toasts triggered simultaneously to demonstrate stacking */
export const StackedToasts: Story = {
  render: () => <StackedToastsDemo />,
};
