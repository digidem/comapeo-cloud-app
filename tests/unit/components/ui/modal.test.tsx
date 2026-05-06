import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '@/components/ui/modal';

describe('Modal', () => {
  it('renders when open=true', () => {
    render(
      <Modal open={true} onOpenChange={() => {}} title="Test Modal">
        Modal content
      </Modal>,
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="Test Modal">
        Modal content
      </Modal>,
    );
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('shows title and description', () => {
    render(
      <Modal
        open={true}
        onOpenChange={() => {}}
        title="Test Modal"
        description="A description"
      >
        Content
      </Modal>,
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('close button calls onOpenChange(false)', async () => {
    const handleOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open={true} onOpenChange={handleOpenChange} title="Test Modal">
        Content
      </Modal>,
    );
    // Radix Dialog renders a close button with aria-label or accessible name
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await user.click(closeBtn);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
