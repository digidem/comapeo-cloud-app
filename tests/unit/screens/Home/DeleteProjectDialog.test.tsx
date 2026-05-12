import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteProjectDialog } from '@/screens/Home/DeleteProjectDialog';

vi.mock('@/lib/data-layer', () => ({
  deleteProject: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteProjectDialog', () => {
  it('renders when open', () => {
    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('is not rendered when closed', () => {
    render(
      <DeleteProjectDialog
        isOpen={false}
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows project name in confirmation message', () => {
    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Are you sure you want to delete/),
    ).toBeInTheDocument();
    expect(screen.getByText(/My Project/)).toBeInTheDocument();
  });

  it('calls deleteProject and onDeleted on confirm', async () => {
    const { deleteProject } = await import('@/lib/data-layer');
    vi.mocked(deleteProject).mockResolvedValue(undefined as never);

    const user = userEvent.setup();
    const onDeleted = vi.fn();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith('p1');
      expect(onDeleted).toHaveBeenCalledOnce();
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={onClose}
        onDeleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows error state when deleteProject fails with Error', async () => {
    const { deleteProject } = await import('@/lib/data-layer');
    vi.mocked(deleteProject).mockRejectedValue(
      new Error('Delete operation failed'),
    );

    const user = userEvent.setup();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Delete operation failed'),
      ).toBeInTheDocument();
    });
  });

  it('shows fallback error message when deleteProject fails with non-Error', async () => {
    const { deleteProject } = await import('@/lib/data-layer');
    vi.mocked(deleteProject).mockRejectedValue('unknown error');

    const user = userEvent.setup();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="p1"
        projectName="My Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to delete project'),
      ).toBeInTheDocument();
    });
  });
});
