import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Delete Item?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText('Delete Item?')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const handleConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange with false when cancel is clicked', async () => {
    const handleOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={handleOpenChange}
        title="Delete Item?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders children content', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      >
        <p>Extra warning content</p>
      </ConfirmDialog>,
    );

    expect(screen.getByText('Extra warning content')).toBeInTheDocument();
  });

  it('renders without description', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Confirm?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('uses primary variant when specified', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm?"
        confirmLabel="OK"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'OK' });
    expect(button).toBeInTheDocument();
  });
});
