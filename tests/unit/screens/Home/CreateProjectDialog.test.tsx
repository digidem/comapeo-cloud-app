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

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, 'Test Project');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: 'Test Project',
        description: '',
      });
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
      expect(createProject).toHaveBeenCalledWith({ name: '', description: '' });
      expect(onCreated).toHaveBeenCalledWith('empty-id');
    });
  });

  it('shows error message when createProject fails with Error', async () => {
    const { createProject } = await import('@/lib/data-layer');
    vi.mocked(createProject).mockRejectedValue(
      new Error('Database write failed'),
    );

    const user = userEvent.setup();

    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Database write failed')).toBeInTheDocument();
    });
  });

  it('shows default error message when createProject fails with non-Error', async () => {
    const { createProject } = await import('@/lib/data-layer');
    vi.mocked(createProject).mockRejectedValue('unknown error');

    const user = userEvent.setup();

    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to create project')).toBeInTheDocument();
    });
  });

  it('description field is rendered', () => {
    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(
      screen.getByPlaceholderText('Short description of the project'),
    ).toBeInTheDocument();
  });

  it('uses provided serverUrl as default value', async () => {
    const { useAuthStore } = await import('@/stores/auth-store');
    await useAuthStore.getState().addServer({
      label: 'Custom Server',
      baseUrl: 'https://custom-server.test',
      token: 'test-token',
    });

    render(
      <CreateProjectDialog
        isOpen
        onClose={vi.fn()}
        onCreated={vi.fn()}
        serverUrl="https://custom-server.test"
      />,
    );

    // The form should initialize with the provided serverUrl (not LOCAL_SERVER_VALUE)
    // We verify the branch where _serverUrl is defined (line 120: _serverUrl ?? LOCAL_SERVER_VALUE)
    expect(screen.getByRole('dialog')).toBeDefined();
    // The Radix Select trigger should display the matching server's URL value
    expect(screen.getAllByText('Custom Server').length).toBeGreaterThan(0);
  });

  it('creates project with description', async () => {
    const { createProject } = await import('@/lib/data-layer');
    vi.mocked(createProject).mockResolvedValue({
      localId: 'new-id',
      name: 'Forest Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(
      <CreateProjectDialog isOpen onClose={vi.fn()} onCreated={onCreated} />,
    );

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, 'Forest Project');
    await user.type(inputs[1]!, 'Monitoring forest health');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: 'Forest Project',
        description: 'Monitoring forest health',
      });
      expect(onCreated).toHaveBeenCalledWith('new-id');
    });
  });
});
