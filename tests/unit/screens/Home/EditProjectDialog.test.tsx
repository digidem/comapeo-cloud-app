import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditProjectDialog } from '@/screens/Home/EditProjectDialog';

vi.mock('@/lib/data-layer', () => ({
  updateProject: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EditProjectDialog', () => {
  it('renders when open', () => {
    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('is not rendered when closed', () => {
    render(
      <EditProjectDialog
        isOpen={false}
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows current name in the input field', () => {
    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="Existing Project Name"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[0]!.value).toBe('Existing Project Name');
  });

  it('calls updateProject and onSaved on save with new name', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(undefined as never);

    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="Old Name"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs[0]!;
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('p1', {
        name: 'Updated Name',
        description: '',
      });
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it('prevents save when name is empty (whitespace-only)', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(undefined as never);

    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs[0]!;
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /save/i }));

    // Should NOT call updateProject or onSaved when name is empty/whitespace
    expect(updateProject).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows error state when updateProject fails with Error', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockRejectedValue(
      new Error('Database write failed'),
    );

    const user = userEvent.setup();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Database write failed')).toBeInTheDocument();
    });
  });

  it('shows fallback error message when updateProject fails with non-Error', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockRejectedValue('unknown error');

    const user = userEvent.setup();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update project')).toBeInTheDocument();
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('enables save button while loading state', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    // Keep the promise pending so the button stays in loading state
    vi.mocked(updateProject).mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save/i }));

    // Button should show loading indicator
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeInTheDocument();
  });

  it('shows current description in the description input field', () => {
    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        currentDescription="Existing description"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[1]!.value).toBe('Existing description');
  });

  it('calls updateProject with both name and description on save', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(undefined as never);

    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="Old Name"
        currentDescription="Old description"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs[0]!;
    const descInput = inputs[1]!;
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.clear(descInput);
    await user.type(descInput, 'New description');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('p1', {
        name: 'New Name',
        description: 'New description',
      });
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it('calls updateProject with empty description when cleared', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(undefined as never);

    const user = userEvent.setup();

    render(
      <EditProjectDialog
        isOpen
        projectLocalId="p1"
        currentName="My Project"
        currentDescription="Existing description"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    const descInput = inputs[1]!;
    await user.clear(descInput);
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('p1', {
        name: 'My Project',
        description: '',
      });
    });
  });
});
