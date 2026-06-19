import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useEffect, useRef } from 'react';

import { ToastProvider, useToast } from '@/components/ui/toast';

function ToastDemo({
  variant = 'info',
  title = 'Toast title',
  description,
  autoTrigger = false,
}: {
  variant?: 'info' | 'success' | 'error';
  title?: string;
  description?: string;
  /** Automatically trigger the toast on mount (for static screenshots). */
  autoTrigger?: boolean;
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
          autoTrigger={autoTrigger}
        />
      </div>
    </ToastProvider>
  );
}

function TriggerButton({
  variant,
  title,
  description,
  autoTrigger = false,
}: {
  variant: 'info' | 'success' | 'error';
  title: string;
  description?: string;
  autoTrigger?: boolean;
}) {
  const { addToast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (autoTrigger && !fired.current) {
      fired.current = true;
      addToast({ variant, title, description, duration: 999999 });
    }
  }, [autoTrigger, addToast, variant, title, description]);

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

function StackedToastsDemo({ autoTrigger = false }: { autoTrigger?: boolean }) {
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
        <StackedTriggerButton autoTrigger={autoTrigger} />
      </div>
    </ToastProvider>
  );
}

function StackedTriggerButton({
  autoTrigger = false,
}: {
  autoTrigger?: boolean;
}) {
  const { addToast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (autoTrigger && !fired.current) {
      fired.current = true;
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
    }
  }, [autoTrigger, addToast]);

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

/** Info toast with blue styling (auto-triggered for screenshot) */
export const InfoToast: Story = {
  render: () => (
    <ToastDemo
      variant="info"
      title="Information"
      description="This is an informational message."
      autoTrigger
    />
  ),
};

/** Success toast with green styling (auto-triggered for screenshot) */
export const SuccessToast: Story = {
  render: () => (
    <ToastDemo
      variant="success"
      title="Success"
      description="Operation completed successfully."
      autoTrigger
    />
  ),
};

/** Error toast with red styling (auto-triggered for screenshot) */
export const ErrorToast: Story = {
  render: () => (
    <ToastDemo
      variant="error"
      title="Error"
      description="Something went wrong. Please try again."
      autoTrigger
    />
  ),
};

/** Toast with both title and description (auto-triggered for screenshot) */
export const WithDescription: Story = {
  render: () => (
    <ToastDemo
      variant="info"
      title="New update available"
      description="Version 2.0 is ready to install. Restart to apply changes."
      autoTrigger
    />
  ),
};

/** Two toasts triggered simultaneously to demonstrate stacking (auto-triggered for screenshot) */
export const StackedToasts: Story = {
  render: () => <StackedToastsDemo autoTrigger />,
};
