import { act, fireEvent } from '@testing-library/react';
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@/components/ui/toast';

function ToastTestConsumer({
  variant = 'info',
  title,
  description,
  duration,
}: {
  variant?: 'success' | 'error' | 'info';
  title: string;
  description?: string;
  duration?: number;
}) {
  const { addToast } = useToast();
  return (
    <button
      onClick={() => addToast({ variant, title, description, duration })}
      type="button"
    >
      Show Toast
    </button>
  );
}

function renderWithToastProvider(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// Radix Toast renders multiple elements with role="status" (the toast itself + an aria-live announcer).
// We select the visible toast (the <li> inside the viewport <ol>) by finding the one that contains the title text.
function getVisibleToast() {
  const allStatus = screen.getAllByRole('status');
  // The visible toast is the <li> element that is a direct child of the <ol> viewport
  return allStatus.find((el) => el.tagName === 'LI') as HTMLElement;
}

describe('Toast', () => {
  it('renders toast with title and description', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer title="Test Title" description="Test description" />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('renders success variant with correct styling classes', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer variant="success" title="Success!" />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toast = getVisibleToast();
    expect(toast.className).toContain('bg-success-soft');
    expect(toast.className).toContain('text-success');
  });

  it('renders error variant with correct styling classes', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer variant="error" title="Error!" />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toast = getVisibleToast();
    expect(toast.className).toContain('bg-error-soft');
    expect(toast.className).toContain('text-error');
  });

  it('renders info variant with correct styling classes', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer variant="info" title="Info!" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toast = getVisibleToast();
    expect(toast.className).toContain('bg-info-soft');
    expect(toast.className).toContain('text-info');
  });

  it('dismiss button closes toast', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer title="Dismiss me" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();
    const dismissBtn = screen.getByRole('button', { name: /close/i });
    await user.click(dismissBtn);
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('auto-dismisses after duration', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithToastProvider(
      <ToastTestConsumer title="Auto dismiss" duration={3000} />,
    );
    const button = screen.getByRole('button', { name: 'Show Toast' });
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText('Auto dismiss')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Auto dismiss')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
