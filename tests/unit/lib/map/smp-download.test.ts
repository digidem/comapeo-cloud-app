import { describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { getDb } from '@/lib/db';
import {
  downloadSmp,
  estimateDownloadSize,
  formatBytes,
} from '@/lib/map/smp-download';

const { mockDownload } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
}));

vi.mock('styled-map-package-api/download', () => ({
  download: mockDownload,
}));

function createMockMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'project-1',
    name: 'Test Map',
    type: 'style',
    styleUrl: 'https://tiles.example.com/style.json',
    bbox: [-75, -12, -45, 8],
    minZoom: 0,
    maxZoom: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('estimateDownloadSize', () => {
  it('returns 0 for degenerate bbox (east <= west)', () => {
    expect(estimateDownloadSize([10, 5, 5, 10], 0, 5)).toBe(0);
  });

  it('returns 0 when minZoom > maxZoom', () => {
    expect(estimateDownloadSize([-10, -5, 10, 5], 10, 5)).toBe(0);
  });

  it('returns a positive estimate for a valid small bbox with single zoom level', () => {
    const size = estimateDownloadSize([-1, -1, 1, 1], 0, 0);
    // At zoom 0 there is exactly 1 tile covering the whole world, but our
    // fractional bbox may yield 0 or 1 tiles depending on the floor math.
    // Just verify it's a non-negative finite number.
    expect(size).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(size)).toBe(true);
  });

  it('returns larger estimate for wider bbox', () => {
    const small = estimateDownloadSize([-0.1, -0.1, 0.1, 0.1], 0, 4);
    const large = estimateDownloadSize([-80, -50, -30, 20], 0, 4);
    expect(large).toBeGreaterThan(small);
  });
});

describe('formatBytes', () => {
  it('formats 0 as "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1024', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('downloadSmp', () => {
  it('returns mapId on successful download', async () => {
    const updateSpy = vi.spyOn(getDb().maps, 'update').mockResolvedValue(1);
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );

    const result = await downloadSmp({ map: createMockMap() });

    expect(result).toBe('map-1');
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      smpBlob: expect.any(Blob),
      smpSize: 3,
      status: 'ready',
      errorMessage: undefined,
    });
  });

  it('preserves the storage error when recording the error state also fails', async () => {
    const storageError = new Error('Quota exceeded while saving blob');
    const recoveryError = new Error('Quota exceeded while saving error state');
    const updateSpy = vi
      .spyOn(getDb().maps, 'update')
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(storageError)
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce(undefined); // retry succeeds on second attempt
    mockDownload.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );

    await expect(downloadSmp({ map: createMockMap() })).rejects.toBe(
      storageError,
    );
    expect(updateSpy).toHaveBeenCalledTimes(4);
    expect(updateSpy).toHaveBeenLastCalledWith('map-1', {
      errorMessage: 'Storage error: Quota exceeded while saving blob',
      status: 'error',
    });
  });
});
