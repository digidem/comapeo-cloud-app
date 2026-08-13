import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@tests/mocks/test-utils';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { SavedMapsList } from '@/screens/MapScreen/SavedMapsList';
import { useMapStore } from '@/stores/map-store';

const keepDexieTransactionAlive = Dexie.waitFor.bind(Dexie);

function createMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Territory draft',
    type: 'raster',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-06-29T10:00:00.000Z',
    updatedAt: '2026-06-29T10:00:00.000Z',
    ...overrides,
  };
}

async function addProject(
  localId: string,
  activeMapId?: string | null,
  name?: string,
) {
  await getDb().projects.add({
    localId,
    sourceType: 'local',
    sourceId: 'local',
    name,
    activeMapId,
    createdAt: '2026-06-29T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
    dirtyLocal: false,
    deleted: false,
  });
}

describe('SavedMapsList', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    useMapStore.setState({
      activeProjectLocalId: 'project-1',
      activeMapId: null,
    });
    vi.restoreAllMocks();
  });

  it('renders an empty state when no saved maps exist', async () => {
    render(<SavedMapsList projectLocalId="project-1" />);

    expect(await screen.findByText('No saved maps yet')).toBeInTheDocument();
  });

  it('lists saved maps sorted by most recently updated first', async () => {
    await getDb().maps.bulkAdd([
      createMap({
        id: 'older',
        name: 'Older map',
        updatedAt: '2026-06-29T09:00:00.000Z',
      }),
      createMap({
        id: 'newer',
        name: 'Newer map',
        updatedAt: '2026-06-29T11:00:00.000Z',
      }),
    ]);

    render(<SavedMapsList projectLocalId="project-1" />);

    expect(await screen.findByText('Newer map')).toBeInTheDocument();
    const rows = screen.getAllByTestId('saved-map-row');
    expect(rows[0]).toHaveTextContent('Newer map');
    expect(rows[1]).toHaveTextContent('Older map');
  });

  it('switches between this-project and all-project saved maps with origin labels', async () => {
    const user = userEvent.setup();
    await addProject('project-1', null, 'Current territory');
    await addProject('project-2', null, 'Neighbor territory');
    await getDb().maps.bulkAdd([
      createMap({
        id: 'current-map',
        name: 'Current project map',
        projectLocalId: 'project-1',
        updatedAt: '2026-06-29T09:00:00.000Z',
      }),
      createMap({
        id: 'other-map',
        name: 'Other project map',
        projectLocalId: 'project-2',
        updatedAt: '2026-06-29T12:00:00.000Z',
      }),
    ]);

    render(<SavedMapsList projectLocalId="project-1" />);

    expect(await screen.findByText('Current project map')).toBeInTheDocument();
    expect(screen.queryByText('Other project map')).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Saved maps scope' }),
    ).toBeInTheDocument();
    const thisProjectButton = screen.getByRole('button', {
      name: 'This project',
    });
    const allProjectsButton = screen.getByRole('button', {
      name: 'All projects',
    });
    expect(thisProjectButton).toHaveAttribute('aria-pressed', 'true');
    expect(thisProjectButton).toHaveClass('min-h-[44px]');
    expect(allProjectsButton).toHaveClass('min-h-[44px]');
    expect(screen.getByTestId('saved-maps-results')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    await user.click(allProjectsButton);

    expect(allProjectsButton).toHaveAttribute('aria-pressed', 'true');
    const rows = await screen.findAllByTestId('saved-map-row');
    expect(rows[0]).toHaveTextContent('Other project map');
    expect(rows[0]).toHaveTextContent('Origin: Neighbor territory');
    expect(rows[1]).toHaveTextContent('Current project map');
    expect(rows[1]).toHaveTextContent('Origin: Current territory');
  });

  it('renders a safe origin fallback when an all-project map has no resolvable project', async () => {
    const user = userEvent.setup();
    await getDb().maps.add(
      createMap({
        id: 'orphan-map',
        name: 'Orphaned map',
        projectLocalId: 'deleted-project',
      }),
    );

    render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));

    const row = await screen.findByTestId('saved-map-row');
    expect(row).toHaveTextContent('Orphaned map');
    expect(row).toHaveTextContent('Origin project unavailable');
  });

  it('distinguishes an untitled origin project from a missing origin', async () => {
    const user = userEvent.setup();
    await addProject('untitled-project');
    await getDb().maps.add(
      createMap({
        id: 'untitled-map',
        name: 'Untitled origin map',
        projectLocalId: 'untitled-project',
      }),
    );

    render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));

    const row = await screen.findByTestId('saved-map-row');
    expect(row).toHaveTextContent('Origin: Untitled Project');
    expect(row).not.toHaveTextContent('Origin project unavailable');
  });

  it('sets a saved map as active for the current project', async () => {
    const user = userEvent.setup();
    await addProject('project-1');
    await getDb().maps.add(createMap());

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    await waitFor(async () => {
      const project = await getDb().projects.get('project-1');
      expect(project?.activeMapId).toBe('map-1');
    });
    expect(useMapStore.getState().activeMapId).toBe('map-1');
  });

  it('activates a map from another origin project on the currently selected target project', async () => {
    const user = userEvent.setup();
    await addProject('project-1');
    await addProject('project-2');
    await getDb().maps.add(
      createMap({ projectLocalId: 'project-2', name: 'Shared local map' }),
    );

    render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    await waitFor(async () => {
      expect((await getDb().projects.get('project-1'))?.activeMapId).toBe(
        'map-1',
      );
    });
    expect(
      (await getDb().projects.get('project-2'))?.activeMapId,
    ).toBeUndefined();
  });

  it('keeps the activation write bound to the project selected when the mutation starts', async () => {
    const user = userEvent.setup();
    await addProject('project-1');
    await addProject('project-2');
    await getDb().maps.add(
      createMap({ projectLocalId: 'project-2', name: 'Cross-project map' }),
    );

    const projectsTable = getDb().projects;
    const originalUpdate = projectsTable.update.bind(projectsTable);
    let releaseWrite: (() => void) | undefined;
    vi.spyOn(projectsTable, 'update').mockImplementation((...args) => {
      const pendingUpdate = (async () => {
        await keepDexieTransactionAlive(
          new Promise<void>((resolve) => {
            releaseWrite = resolve;
          }),
        );
        return originalUpdate(...args);
      })();
      return pendingUpdate as unknown as ReturnType<
        typeof projectsTable.update
      >;
    });

    const { rerender } = render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    rerender(<SavedMapsList projectLocalId="project-2" />);
    await act(async () => {
      useMapStore.getState().hydrateActiveMap('project-2', null);
      releaseWrite?.();
    });

    await waitFor(async () => {
      expect((await getDb().projects.get('project-1'))?.activeMapId).toBe(
        'map-1',
      );
    });
    expect(
      (await getDb().projects.get('project-2'))?.activeMapId,
    ).toBeUndefined();
    expect(useMapStore.getState().activeProjectLocalId).toBe('project-2');
    expect(useMapStore.getState().activeMapId).toBeNull();
  });

  it('reconciles a successful activation after switching away and back before the write finishes', async () => {
    const user = userEvent.setup();
    await addProject('project-1');
    await addProject('project-2');
    await getDb().maps.add(
      createMap({ projectLocalId: 'project-2', name: 'Cross-project map' }),
    );

    const projectsTable = getDb().projects;
    const originalUpdate = projectsTable.update.bind(projectsTable);
    let releaseWrite: (() => void) | undefined;
    vi.spyOn(projectsTable, 'update').mockImplementation((...args) => {
      const pendingUpdate = (async () => {
        await keepDexieTransactionAlive(
          new Promise<void>((resolve) => {
            releaseWrite = resolve;
          }),
        );
        return originalUpdate(...args);
      })();
      return pendingUpdate as unknown as ReturnType<
        typeof projectsTable.update
      >;
    });

    const { rerender } = render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    rerender(<SavedMapsList projectLocalId="project-2" />);
    await act(async () => {
      useMapStore.getState().hydrateActiveMap('project-2', null);
    });
    rerender(<SavedMapsList projectLocalId="project-1" />);
    await act(async () => {
      // Simulate hydration reading the old persisted value before the delayed
      // activation write lands.
      useMapStore.getState().hydrateActiveMap('project-1', null);
      releaseWrite?.();
    });

    await waitFor(async () => {
      expect((await getDb().projects.get('project-1'))?.activeMapId).toBe(
        'map-1',
      );
    });
    expect(useMapStore.getState().activeProjectLocalId).toBe('project-1');
    expect(useMapStore.getState().activeMapId).toBe('map-1');
  });

  it('does not roll a failed activation back into a project selected while the write is pending', async () => {
    const user = userEvent.setup();
    await addProject('project-1');
    await addProject('project-2', 'map-2');
    await getDb().maps.add(
      createMap({ projectLocalId: 'project-2', name: 'Cross-project map' }),
    );

    const projectsTable = getDb().projects;
    let rejectWrite: ((error: Error) => void) | undefined;
    vi.spyOn(projectsTable, 'update').mockReturnValueOnce(
      new Promise<number>((_resolve, reject) => {
        rejectWrite = reject;
      }) as unknown as ReturnType<typeof projectsTable.update>,
    );

    const { rerender } = render(<SavedMapsList projectLocalId="project-1" />);
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    rerender(<SavedMapsList projectLocalId="project-2" />);
    await act(async () => {
      useMapStore.getState().hydrateActiveMap('project-2', 'map-2');
      rejectWrite?.(new Error('IndexedDB write failed'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update active map. Please try again.',
    );
    expect(useMapStore.getState().activeProjectLocalId).toBe('project-2');
    expect(useMapStore.getState().activeMapId).toBe('map-2');
    expect(
      (await getDb().projects.get('project-1'))?.activeMapId,
    ).toBeUndefined();
  });

  it('shows an error and rolls back when setting the active map fails', async () => {
    const user = userEvent.setup();
    await addProject('project-1', null);
    await getDb().maps.add(createMap());
    vi.spyOn(getDb().projects, 'update').mockResolvedValueOnce(0);

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Set active' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update active map. Please try again.',
    );
    expect(useMapStore.getState().activeMapId).toBeNull();
    expect((await getDb().projects.get('project-1'))?.activeMapId).toBeNull();
  });

  it('clears a stale active-map error when opening the rename dialog', async () => {
    const user = userEvent.setup();
    await addProject('project-1', null);
    await getDb().maps.add(createMap());
    vi.spyOn(getDb().projects, 'update').mockResolvedValueOnce(0);

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Set active' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update active map. Please try again.',
    );

    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(
      await screen.findByRole('dialog', { name: 'Rename map' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Could not update active map. Please try again.'),
    ).not.toBeInTheDocument();
  });

  it('clears a stale active-map error when opening the delete dialog', async () => {
    const user = userEvent.setup();
    await addProject('project-1', null);
    await getDb().maps.add(createMap());
    vi.spyOn(getDb().projects, 'update').mockResolvedValueOnce(0);

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Set active' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update active map. Please try again.',
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByRole('dialog', { name: 'Delete map' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Could not update active map. Please try again.'),
    ).not.toBeInTheDocument();
  });

  it('only shows loading on the set-active button for the row being updated and disables other actions', async () => {
    const user = userEvent.setup();
    let resolveUpdate: (value: number) => void = () => {};
    const projectsTable = getDb().projects;
    vi.spyOn(projectsTable, 'update').mockImplementationOnce(() => {
      const pendingUpdate = new Promise<number>((resolve) => {
        resolveUpdate = resolve;
      });
      return keepDexieTransactionAlive(pendingUpdate) as unknown as ReturnType<
        typeof projectsTable.update
      >;
    });
    await addProject('project-1');
    await getDb().maps.bulkAdd([
      createMap({ id: 'map-1', name: 'First map' }),
      createMap({ id: 'map-2', name: 'Second map' }),
    ]);

    render(<SavedMapsList projectLocalId="project-1" />);

    const rows = await screen.findAllByTestId('saved-map-row');
    const firstSetActive = within(rows[0]!).getByRole('button', {
      name: 'Set active',
    });
    const secondSetActive = within(rows[1]!).getByRole('button', {
      name: 'Set active',
    });

    await user.click(firstSetActive);

    expect(firstSetActive).toHaveAttribute('aria-busy', 'true');
    expect(secondSetActive).not.toHaveAttribute('aria-busy');
    expect(secondSetActive).toBeDisabled();
    expect(
      within(rows[1]!).getByRole('button', { name: 'Rename' }),
    ).toBeDisabled();
    expect(
      within(rows[1]!).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled();

    await act(async () => {
      resolveUpdate(1);
    });
  });

  it('renames a saved map', async () => {
    const user = userEvent.setup();
    await getDb().maps.add(createMap());

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename map' });
    const nameInput = within(dialog).getByLabelText('Map name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed territory');
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Renamed territory')).toBeInTheDocument();
    expect((await getDb().maps.get('map-1'))?.name).toBe('Renamed territory');
  });

  it('shows a rename error and keeps the dialog open when renaming fails', async () => {
    const user = userEvent.setup();
    await getDb().maps.add(createMap());
    vi.spyOn(getDb().maps, 'update').mockRejectedValueOnce(
      new Error('IndexedDB write failed'),
    );

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename map' });
    const nameInput = within(dialog).getByLabelText('Map name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed territory');
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));

    expect(
      await within(dialog).findByText('Could not save map. Please try again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Rename map' }),
    ).toBeInTheDocument();
    expect((await getDb().maps.get('map-1'))?.name).toBe('Territory draft');
  });

  it('deletes a saved map and clears activeMapId on every referencing project', async () => {
    const user = userEvent.setup();
    await addProject('project-1', 'map-1');
    await addProject('project-2', 'map-1');
    await getDb().maps.add(createMap());

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete map' });
    expect(
      within(dialog).getByText(
        'Are you sure you want to delete “Territory draft”? This action cannot be undone.',
      ),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete map' }),
    );

    await waitFor(async () => {
      expect(await getDb().maps.get('map-1')).toBeUndefined();
      expect((await getDb().projects.get('project-1'))?.activeMapId).toBeNull();
      expect((await getDb().projects.get('project-2'))?.activeMapId).toBeNull();
    });
  });

  it('shows Preview only for ready maps', async () => {
    await getDb().maps.bulkAdd([
      createMap({ id: 'draft-map', name: 'Draft map', status: 'draft' }),
      createMap({
        id: 'ready-map',
        name: 'Ready map',
        status: 'ready',
        smpBlob: new Blob(['smp']),
        smpSize: 3,
      }),
    ]);

    render(<SavedMapsList projectLocalId="project-1" />);

    const rows = await screen.findAllByTestId('saved-map-row');
    const readyRow = rows.find((row) =>
      row.textContent?.includes('Ready map'),
    )!;
    const draftRow = rows.find((row) =>
      row.textContent?.includes('Draft map'),
    )!;

    expect(
      within(readyRow).getByRole('button', { name: 'Preview' }),
    ).toBeInTheDocument();
    expect(
      within(draftRow).queryByRole('button', { name: 'Preview' }),
    ).not.toBeInTheDocument();
  });

  it('shows a delete error, keeps the dialog open, and leaves the map when deletion fails', async () => {
    const user = userEvent.setup();
    await getDb().maps.add(createMap());
    vi.spyOn(getDb().maps, 'delete').mockRejectedValueOnce(
      new Error('IndexedDB delete failed'),
    );

    render(<SavedMapsList projectLocalId="project-1" />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete map' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete map' }),
    );

    expect(
      await within(dialog).findByText(
        'Could not delete map. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Delete map' }),
    ).toBeInTheDocument();
    expect(await getDb().maps.get('map-1')).toMatchObject({
      name: 'Territory draft',
    });
    expect(screen.getByText('Territory draft')).toBeInTheDocument();
  });
});
