import { act, fireEvent, render as rawRender } from '@testing-library/react';
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ReactElement, ReactNode } from 'react';

import { ToastProvider, useToast } from '@/components/ui/toast';

// ---------------------------------------------------------------------------
// Static mock for @radix-ui/react-toast
//
// The previous importOriginal-based mock dies with
// "Cannot access '__vi_import_2__' before initialization": test-utils now
// imports ToastProvider (-> @radix-ui/react-toast), so this factory runs
// while evaluating test-utils, before THIS file's own imports are
// initialized. Top-level runtime references are therefore in TDZ — the mock
// must be fully self-contained. Static imports cannot work here (they are
// hoisted above vi.mock and evaluated too late), so React is loaded inside
// the factory, mirroring importOriginal's module-boundary behavior.
//
// The mock reimplements the two behaviors ToastProvider relies on:
//  - onOpenChange(true) on mount (Radix never fires it in uncontrolled mode)
//  - auto-dismiss via a duration timer (Radix schedules this internally)
// ---------------------------------------------------------------------------

interface MockToastContextValue {
  onOpenChange?: (open: boolean) => void;
}

interface PrimitiveProps {
  children?: ReactNode;
  className?: string;
}

interface RootProps extends PrimitiveProps {
  role?: string;
  duration?: number;
  onOpenChange?: (open: boolean) => void;
}

vi.mock('@radix-ui/react-toast', async () => {
  // See header comment: static imports are hoisted above vi.mock and are in
  // TDZ when this factory runs (test-utils imports ToastProvider first), so
  // React must be loaded inside the factory.
  const { createContext, forwardRef, useContext, useEffect } =
    await import('react');

  const MockToastContext = createContext<MockToastContextValue>({});

  const MockRoot = forwardRef<HTMLLIElement, RootProps>(function MockRoot(
    { children, className, duration, onOpenChange, role },
    ref,
  ) {
    // Fire onOpenChange(true) on mount to cover the !open === false (noop)
    // branch in ToastProvider, and implement Radix's auto-dismiss so
    // duration-based dismissal keeps working without the real implementation.
    useEffect(() => {
      onOpenChange?.(true);
      if (duration === undefined) return undefined;
      const timer = setTimeout(() => onOpenChange?.(false), duration);
      return () => clearTimeout(timer);
    }, []);
    return (
      <MockToastContext.Provider value={{ onOpenChange }}>
        <li ref={ref} role={role} className={className}>
          {children}
        </li>
      </MockToastContext.Provider>
    );
  });
  MockRoot.displayName = 'Root';

  const MockClose = forwardRef<
    HTMLButtonElement,
    PrimitiveProps & { 'aria-label'?: string }
  >(function MockClose({ children, className, 'aria-label': ariaLabel }, ref) {
    const { onOpenChange } = useContext(MockToastContext);
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        className={className}
        onClick={() => onOpenChange?.(false)}
      >
        {children}
      </button>
    );
  });
  MockClose.displayName = 'Close';

  const MockTitle = forwardRef<HTMLDivElement, PrimitiveProps>(
    function MockTitle({ children, className }, ref) {
      return (
        <div ref={ref} className={className}>
          {children}
        </div>
      );
    },
  );
  MockTitle.displayName = 'Title';

  const MockDescription = forwardRef<HTMLDivElement, PrimitiveProps>(
    function MockDescription({ children, className }, ref) {
      return (
        <div ref={ref} className={className}>
          {children}
        </div>
      );
    },
  );
  MockDescription.displayName = 'Description';

  const MockViewport = forwardRef<HTMLOListElement, PrimitiveProps>(
    function MockViewport({ children, className }, ref) {
      return (
        <ol ref={ref} className={className}>
          {children}
        </ol>
      );
    },
  );
  MockViewport.displayName = 'Viewport';

  const MockAction = forwardRef<
    HTMLButtonElement,
    PrimitiveProps & { altText?: string; onClick?: () => void }
  >(function MockAction({ children, className, altText, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={altText}
        className={className}
        onClick={onClick}
      >
        {children}
      </button>
    );
  });
  MockAction.displayName = 'Action';

  function MockProvider({
    children,
  }: {
    children?: ReactNode;
    swipeDirection?: string;
  }) {
    return <>{children}</>;
  }
  MockProvider.displayName = 'Provider';

  return {
    Provider: MockProvider,
    Root: MockRoot,
    Title: MockTitle,
    Description: MockDescription,
    Close: MockClose,
    Action: MockAction,
    Viewport: MockViewport,
  };
});

function ToastTestConsumer({
  variant = 'info',
  title,
  description,
  duration,
  action,
}: {
  variant?: 'success' | 'error' | 'info';
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}) {
  const { addToast } = useToast();
  return (
    <button
      onClick={() =>
        addToast({ variant, title, description, duration, action })
      }
      type="button"
    >
      Show Toast
    </button>
  );
}

function renderWithToastProvider(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// The static mock renders the visible toast as a <li role="status"> inside
// the viewport <ol>. The real Radix implementation also emits an aria-live
// announcer with role="status", so we still select the LI to be safe.
function getVisibleToast() {
  const allStatus = screen.getAllByRole('status');
  const visibleToast = allStatus.find((el) => el.tagName === 'LI') as
    HTMLElement | undefined;
  if (!visibleToast) {
    throw new Error('No visible toast <li> found');
  }
  return visibleToast;
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
    // Pin the exact variant triplet so a stray legacy text color (e.g.
    // 'text-success') cannot silently ride alongside 'text-text'.
    expect(toast.className).toContain(
      'bg-success-soft text-text border-success',
    );
    expect(toast.className).not.toContain('text-success');
  });

  it('renders error variant with correct styling classes', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer variant="error" title="Error!" />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toast = getVisibleToast();
    expect(toast.className).toContain('bg-error-soft text-text border-error');
    expect(toast.className).not.toContain('text-error');
  });

  it('renders info variant with correct styling classes', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer variant="info" title="Info!" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toast = getVisibleToast();
    expect(toast.className).toContain('bg-info-soft text-text border-info');
    expect(toast.className).not.toContain('text-info');
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

  it('useToast throws without provider', () => {
    function BadConsumer() {
      useToast();
      return null;
    }
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    // Raw render: the test-utils wrapper always provides ToastProvider, so it
    // cannot exercise the missing-provider path.
    expect(() => rawRender(<BadConsumer />)).toThrow(
      'useToast must be used within a ToastProvider',
    );
    consoleError.mockRestore();
  });

  it('renders optional description when provided', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer title="Title" description="Optional description" />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Optional description')).toBeInTheDocument();
  });

  it('renders toast without description (no conditional description block)', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer title="No desc" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('No desc')).toBeInTheDocument();
  });

  it('does not remove toast when onOpenChange fires with true (noop branch)', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer title="Noop branch" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    // The mocked Root calls onOpenChange(true) on mount, which hits the
    // !open === false branch (noop) — the toast must remain visible.
    expect(screen.getByText('Noop branch')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Toast actions (Reconnect / Open Settings recovery paths)
  // -------------------------------------------------------------------------

  it('renders an action button and fires its onClick', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithToastProvider(
      <ToastTestConsumer
        title="Session expired"
        action={{ label: 'Reconnect', onClick: onAction }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    const actionButton = screen.getByRole('button', { name: 'Reconnect' });
    // altText is carried for assistive tech even though the visible label and
    // altText match here.
    expect(actionButton).toHaveAttribute('aria-label', 'Reconnect');
    await user.click(actionButton);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('meets the 44px touch-target minimum and is pointer-affordant', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(
      <ToastTestConsumer
        title="Sync paused"
        action={{ label: 'Open Settings', onClick: vi.fn() }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));

    const actionButton = screen.getByRole('button', { name: 'Open Settings' });
    expect(actionButton.className).toContain('min-h-[44px]');
    expect(actionButton.className).toContain('cursor-pointer');
  });

  it('keeps an action-bearing toast open for 10 seconds', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithToastProvider(
      <ToastTestConsumer
        title="Session expired"
        action={{ label: 'Reconnect', onClick: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText('Session expired')).toBeInTheDocument();

    // The default 5s dismissal must not fire for an actionable toast — a
    // "Reconnect" affordance that vanishes in 5s is untappable.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Session expired')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('still honours an explicit duration on an action-bearing toast', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithToastProvider(
      <ToastTestConsumer
        title="Explicit duration"
        duration={2000}
        action={{ label: 'Reconnect', onClick: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    act(() => {
      vi.advanceTimersByTime(0);
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Explicit duration')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders no action button when the toast has none', async () => {
    const user = userEvent.setup();
    renderWithToastProvider(<ToastTestConsumer title="No action" />);
    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    // Only the close affordance is present.
    expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
  });
});
