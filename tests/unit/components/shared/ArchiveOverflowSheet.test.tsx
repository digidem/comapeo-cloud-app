import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ArchiveOverflowSheet } from '@/components/shared/ArchiveOverflowSheet';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  archiveName: 'Test Archive',
  onViewDetails: vi.fn(),
  onEdit: vi.fn(),
  onSync: vi.fn(),
  onCopyUrl: vi.fn(),
  onRemove: vi.fn(),
};

describe('ArchiveOverflowSheet', () => {
  it('renders all 5 action buttons when open', () => {
    render(<ArchiveOverflowSheet {...defaultProps} />);
    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.getByText('Edit Archive')).toBeInTheDocument();
    expect(screen.getByText('Sync Now')).toBeInTheDocument();
    expect(screen.getByText('Copy URL')).toBeInTheDocument();
    expect(screen.getByText('Remove Archive')).toBeInTheDocument();
  });

  it('renders the archive name in the header', () => {
    render(<ArchiveOverflowSheet {...defaultProps} />);
    expect(screen.getByText('Test Archive')).toBeInTheDocument();
  });

  it('has a dialog title for accessibility', () => {
    render(<ArchiveOverflowSheet {...defaultProps} />);
    expect(
      screen.getByRole('dialog', { name: 'Actions for Test Archive' }),
    ).toBeInTheDocument();
  });

  it('does not render content when open=false', () => {
    render(<ArchiveOverflowSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('View Details')).not.toBeInTheDocument();
  });

  it('has a close button', () => {
    render(<ArchiveOverflowSheet {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('calls onViewDetails and closes when "View Details" clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onViewDetails = vi.fn();
    render(
      <ArchiveOverflowSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onViewDetails={onViewDetails}
      />,
    );

    await user.click(screen.getByText('View Details'));
    expect(onViewDetails).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onEdit and closes when "Edit Archive" clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onEdit = vi.fn();
    render(
      <ArchiveOverflowSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByText('Edit Archive'));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onSync and closes when "Sync Now" clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSync = vi.fn();
    render(
      <ArchiveOverflowSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onSync={onSync}
      />,
    );

    await user.click(screen.getByText('Sync Now'));
    expect(onSync).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onCopyUrl and closes when "Copy URL" clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCopyUrl = vi.fn();
    render(
      <ArchiveOverflowSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onCopyUrl={onCopyUrl}
      />,
    );

    await user.click(screen.getByText('Copy URL'));
    expect(onCopyUrl).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onRemove and closes when "Remove Archive" clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <ArchiveOverflowSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByText('Remove Archive'));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when close button (X) is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ArchiveOverflowSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ArchiveOverflowSheet {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // Radix Dialog renders the overlay as a sibling before the dialog content
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.previousElementSibling;
    expect(overlay).toBeTruthy();

    await user.click(overlay!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
