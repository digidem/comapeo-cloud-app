import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageSettings } from '@/components/shared/StorageSettings';
import { getDb, resetDb } from '@/lib/db';
import * as localStorageUtils from '@/lib/local-storage-utils';

// Mock browser APIs used by storage settings.
const mockEstimate = vi.fn();
const mockReload = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('navigator', {
    ...navigator,
    storage: {
      estimate: mockEstimate,
    },
  });

  mockEstimate.mockResolvedValue({
    quota: 1073741824,
    usage: 52428800,
  });
  mockReload.mockReset();
  Object.defineProperty(window, 'location', {
    value: { reload: mockReload },
    writable: true,
  });
  const db = getDb();
  if (!db.isOpen()) await db.open();
  await resetDb();
});

describe('StorageSettings', () => {
  it('shows loading skeleton initially', () => {
    // Don't resolve the estimate so it stays loading
    mockEstimate.mockReturnValue(new Promise(() => {}));

    render(<StorageSettings />);
    // Should show skeleton placeholders
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Loading storage information',
    );
  });

  it('displays total usage after loading', async () => {
    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    expect(screen.getByText(/4\.9%/)).toBeInTheDocument();
    expect(screen.getByText(/50\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 GB/)).toBeInTheDocument();
  });

  it('localizes usage percentage text and progress accessibility text', async () => {
    render(<StorageSettings />, { locale: 'pt' });

    const progress = await screen.findByRole('progressbar');

    expect(screen.getByText('4,9% usado')).toBeInTheDocument();
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '4,9% do armazenamento usado',
    );
  });

  it('displays per-table record counts', async () => {
    const db = getDb();

    await db.projects.bulkAdd([
      {
        localId: 'proj-1',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'proj-2',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'proj-3',
        sourceType: 'local',
        sourceId: 'local',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: false,
        deleted: false,
      },
    ]);

    await db.observations.add({
      localId: 'obs-1',
      projectLocalId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    expect(screen.getByText('4 records')).toBeInTheDocument();

    // Projects row shows 3
    const projectsRow = screen.getByText('Projects').closest('div');
    expect(projectsRow).toBeDefined();
    if (projectsRow) {
      expect(projectsRow.textContent).toContain('3');
    }

    // Observations row shows 1
    const observationsRow = screen.getByText('Observations').closest('div');
    expect(observationsRow).toBeDefined();
    if (observationsRow) {
      expect(observationsRow.textContent).toContain('1');
    }
  });

  it('clears all cached data when confirmed', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    const user = userEvent.setup();
    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    // Click clear button
    await user.click(
      screen.getByRole('button', { name: 'Clear All Cached Data' }),
    );

    // Confirm dialog appears
    expect(screen.getByText('Clear All Cached Data?')).toBeInTheDocument();

    // Confirm clearing
    await user.click(
      screen.getByRole('button', { name: 'Yes, Clear Everything' }),
    );

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalledOnce();
    });
    // Real navigation would recreate the app and open a fresh connection. The
    // jsdom reload mock does not, so reopen explicitly before inspecting the DB.
    await db.open();
    expect(await db.projects.count()).toBe(0);
  });

  it('reloads after cached data is cleared to reset persisted in-memory state', async () => {
    const user = userEvent.setup();

    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Clear All Cached Data' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Yes, Clear Everything' }),
    );

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('still reloads when localStorage removal is blocked', async () => {
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });
    const user = userEvent.setup();

    try {
      render(<StorageSettings />);

      await waitFor(() => {
        expect(screen.getByText('Total Usage')).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: 'Clear All Cached Data' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Yes, Clear Everything' }),
      );

      await waitFor(() => {
        expect(mockReload).toHaveBeenCalled();
      });
      // Auth-store behavior and exact reload scheduling are covered directly in
      // lower-level tests; this integration test only owns reaching the reload path.
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it('shows partial reset failures after the confirmation dialog closes', async () => {
    const clearSpy = vi
      .spyOn(localStorageUtils, 'clearAllStorage')
      .mockRejectedValueOnce(
        new localStorageUtils.ClearAllStorageError({
          failedStep: 'app-db',
          partial: true,
          cause: new Error('DB exploded'),
          reloadScheduled: true,
        }),
      );
    const user = userEvent.setup();

    try {
      render(<StorageSettings />);

      await waitFor(() => {
        expect(screen.getByText('Total Usage')).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: 'Clear All Cached Data' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Yes, Clear Everything' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The reset could not finish safely. The app will reload and continue recovery.',
      );
      expect(
        screen.queryByText('Clear All Cached Data?'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('DB exploded')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Clear All Cached Data/ }),
      ).toBeDisabled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('keeps clearing disabled when a non-destructive failure schedules a reload', async () => {
    const clearSpy = vi
      .spyOn(localStorageUtils, 'clearAllStorage')
      .mockRejectedValueOnce(
        new localStorageUtils.ClearAllStorageError({
          failedStep: 'categories-db',
          partial: false,
          reloadScheduled: true,
          cause: new Error('Categories unavailable'),
        }),
      );
    const user = userEvent.setup();

    try {
      render(<StorageSettings />);
      await screen.findByText('Total Usage');

      await user.click(
        screen.getByRole('button', { name: 'Clear All Cached Data' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Yes, Clear Everything' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cached data could not be cleared. Nothing was deleted. The app will reload so you can retry.',
      );
      expect(
        screen.getByRole('button', { name: /Clear All Cached Data/ }),
      ).toBeDisabled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('allows retry when reset fails before destructive clearing starts', async () => {
    const clearSpy = vi
      .spyOn(localStorageUtils, 'clearAllStorage')
      .mockRejectedValueOnce(
        new localStorageUtils.ClearAllStorageError({
          failedStep: 'categories-db',
          partial: false,
          cause: new Error('Categories unavailable'),
        }),
      );
    const user = userEvent.setup();

    try {
      render(<StorageSettings />);
      await screen.findByText('Total Usage');

      await user.click(
        screen.getByRole('button', { name: 'Clear All Cached Data' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Yes, Clear Everything' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cached data could not be cleared. Your existing local data was left unchanged. You can try again.',
      );
      expect(
        screen.getByRole('button', { name: 'Clear All Cached Data' }),
      ).toBeEnabled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('uses the localized cancel label in the clear confirmation dialog', async () => {
    const user = userEvent.setup();

    render(<StorageSettings />, { locale: 'pt' });

    await waitFor(() => {
      expect(screen.getByText('Uso total')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Limpar todos os dados em cache' }),
    );

    expect(
      screen.getByRole('button', { name: 'Cancelar' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aplicativo será recarregado/)).toBeInTheDocument();
  });

  it('shows zero counts when storage is empty', async () => {
    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    expect(screen.getByText('0 records')).toBeInTheDocument();
  });

  it('handles storage API unavailability gracefully', async () => {
    vi.stubGlobal('navigator', {});

    const db = getDb();
    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    render(<StorageSettings />);

    await waitFor(() => {
      expect(screen.getByText('Total Usage')).toBeInTheDocument();
    });

    // Should still show table counts
    expect(screen.getByText('1 records')).toBeInTheDocument();
    // Usage should show 0
    expect(screen.getByText('0.0% used')).toBeInTheDocument();
  });
});
