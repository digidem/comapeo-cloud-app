import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import { CreateProjectDialog } from '@/screens/Home/CreateProjectDialog';

vi.mock('@/lib/data-layer', () => ({
  createProject: vi.fn(),
}));

beforeEach(async () => {
  await resetDb();
});

describe('CreateProjectDialog', () => {
  it('renders when open', () => {
    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('is not rendered when closed', () => {
    render(
      <CreateProjectDialog
        isOpen={false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <CreateProjectDialog isOpen onClose={onClose} onCreated={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking create calls createProject and onCreated', async () => {
    const { createProject } = await import('@/lib/data-layer');
    vi.mocked(createProject).mockResolvedValue({
      localId: 'new-id',
      name: 'Test Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={onCreated} />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test Project');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: 'Test Project' });
      expect(onCreated).toHaveBeenCalledWith('new-id');
    });
  });

  it('allows creating project with empty name', async () => {
    const { createProject } = await import('@/lib/data-layer');
    vi.mocked(createProject).mockResolvedValue({
      localId: 'empty-id',
      name: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={onCreated} />,
    );

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: '' });
      expect(onCreated).toHaveBeenCalledWith('empty-id');
    });
  });
});
