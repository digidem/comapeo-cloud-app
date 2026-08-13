import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllMaps, useMaps } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { getDb, resetDb } from '@/lib/db';
import { DeleteProjectDialog } from '@/screens/Home/DeleteProjectDialog';
import { useMapDownloadStore } from '@/stores/map-download-store';
import { useMapStore } from '@/stores/map-store';

function createMap(): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'origin-project',
    name: 'Origin map',
    type: 'raster',
    origin: 'authored',
    styleUrl: 'https://example.com/{z}/{x}/{y}.png',
    bbox: [-70, -5, -60, 2],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
    status: 'draft',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
  };
}

function MapListProbe() {
  const projectMaps = useMaps('origin-project');
  const allMaps = useAllMaps();

  return (
    <output data-testid="map-list-counts">
      {projectMaps.data?.length ?? -1}:{allMaps.data?.length ?? -1}
    </output>
  );
}

describe('DeleteProjectDialog map cache integration', () => {
  beforeEach(async () => {
    await resetDb();
    useMapDownloadStore.setState({ active: null });
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
    await getDb().projects.add({
      localId: 'origin-project',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Origin Project',
      createdAt: '2026-08-12T12:00:00.000Z',
      updatedAt: '2026-08-12T12:00:00.000Z',
      dirtyLocal: false,
      deleted: false,
    });
    await getDb().maps.add(createMap());
  });

  it('updates project and all-project observers after project deletion', async () => {
    const user = userEvent.setup();

    render(
      <>
        <MapListProbe />
        <DeleteProjectDialog
          isOpen
          projectLocalId="origin-project"
          projectName="Origin Project"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('map-list-counts')).toHaveTextContent('1:1');
    });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByTestId('map-list-counts')).toHaveTextContent('0:0');
    });
    expect(await getDb().maps.get('map-1')).toBeUndefined();
    expect(await getDb().projects.get('origin-project')).toBeUndefined();
  });
});
