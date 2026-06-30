import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { SavedMapsList } from '@/screens/MapScreen/SavedMapsList';
import { useMapStore } from '@/stores/map-store';

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

async function addProject(localId: string, activeMapId?: string | null) {
  await getDb().projects.add({
    localId,
    sourceType: 'local',
    sourceId: 'local',
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
    useMapStore.setState({ activeMapId: null });
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

  it('only shows loading on the set-active button for the row being updated', async () => {
    const user = userEvent.setup();
    let resolveUpdate: (value: number) => void = () => {};
    const projectsTable = getDb().projects;
    vi.spyOn(projectsTable, 'update').mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolveUpdate = resolve;
      }) as unknown as ReturnType<typeof projectsTable.update>,
    );
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
    expect(secondSetActive).toBeEnabled();

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
});
