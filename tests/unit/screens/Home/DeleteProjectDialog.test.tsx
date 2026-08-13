import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryClient } from '@tanstack/react-query';

import {
  getProjectSavedMapIds,
  recoverCancelledMapDownload,
} from '@/lib/map/saved-map-lifecycle';
import { DeleteProjectDialog } from '@/screens/Home/DeleteProjectDialog';
import { useMapDownloadStore } from '@/stores/map-download-store';
import { useMapStore } from '@/stores/map-store';

vi.mock('@/lib/data-layer', () => ({
  deleteProject: vi.fn(),
}));

vi.mock('@/lib/map/saved-map-lifecycle', () => ({
  getProjectSavedMapIds: vi.fn(),
  recoverCancelledMapDownload: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProjectSavedMapIds).mockResolvedValue([]);
  vi.mocked(recoverCancelledMapDownload).mockResolvedValue();
  useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
  useMapDownloadStore.setState({ active: null });
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
    vi.mocked(deleteProject).mockResolvedValue([]);

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

  it('cancels owned downloads before deletion and clears active-map state and caches', async () => {
    const { deleteProject } = await import('@/lib/data-layer');
    vi.mocked(getProjectSavedMapIds).mockResolvedValue(['map-1']);
    vi.mocked(deleteProject).mockResolvedValue(['map-1']);
    useMapStore.setState({
      activeProjectLocalId: 'target-project',
      activeMapId: 'map-1',
    });
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Downloading map',
      cancel,
    });
    const setQueriesData = vi.spyOn(QueryClient.prototype, 'setQueriesData');
    const removeQueries = vi.spyOn(QueryClient.prototype, 'removeQueries');
    const invalidateQueries = vi.spyOn(
      QueryClient.prototype,
      'invalidateQueries',
    );
    const user = userEvent.setup();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="origin-project"
        projectName="Origin Project"
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(useMapStore.getState().activeMapId).toBeNull();
    });
    expect(useMapStore.getState().activeProjectLocalId).toBe('target-project');
    expect(getProjectSavedMapIds).toHaveBeenCalledWith('origin-project');
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteProject).mock.invocationCallOrder[0]!,
    );
    expect(useMapDownloadStore.getState().active).toBeNull();
    expect(setQueriesData).toHaveBeenCalledWith(
      { queryKey: ['maps'] },
      expect.any(Function),
    );
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ['map', 'map-1'],
      exact: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['maps'] });
  });

  it('recovers a cancelled owned download when project deletion fails', async () => {
    const { deleteProject } = await import('@/lib/data-layer');
    vi.mocked(getProjectSavedMapIds).mockResolvedValue(['map-1']);
    vi.mocked(deleteProject).mockRejectedValue(new Error('Delete failed'));
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Downloading map',
      cancel,
    });
    const onDeleted = vi.fn();
    const user = userEvent.setup();

    render(
      <DeleteProjectDialog
        isOpen
        projectLocalId="origin-project"
        projectName="Origin Project"
        onClose={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(await screen.findByText('Delete failed')).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledOnce();
    expect(recoverCancelledMapDownload).toHaveBeenCalledWith('map-1');
    expect(useMapDownloadStore.getState().active).toBeNull();
    expect(onDeleted).not.toHaveBeenCalled();
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
      expect(screen.getByText('Delete operation failed')).toBeInTheDocument();
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
      expect(screen.getByText('Failed to delete project')).toBeInTheDocument();
    });
  });
});
