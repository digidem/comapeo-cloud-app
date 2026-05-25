import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageSettings } from '@/components/shared/StorageSettings';
import { getDb, resetDb } from '@/lib/db';
import * as storage from '@/lib/storage';

// Mock navigator.storage.estimate
const mockEstimate = vi.fn();

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

    await waitFor(async () => {
      const count = await db.projects.count();
      expect(count).toBe(0);
    });
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
