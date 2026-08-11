import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import * as smpDownload from '@/lib/map/smp-download';
import { DownloadPanel } from '@/screens/MapScreen/DownloadPanel';
import { useMapDownloadStore } from '@/stores/map-download-store';

vi.mock('@/hooks/useMaps', () => ({
  useDownloadMap: vi.fn(),
}));

const mutateAsync = vi.fn().mockResolvedValue('map-1');
const reset = vi.fn();

function createMockMap(overrides: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 'map-1',
    projectLocalId: 'proj-1',
    name: 'Test Map',
    type: 'raster',
    styleUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
    bbox: [-75, -12, -45, 8],
    minZoom: 0,
    maxZoom: 14,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DownloadPanel', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue('map-1');
    reset.mockReset();
    useMapDownloadStore.setState({ active: null });
    vi.mocked(useDownloadMap).mockReturnValue({
      error: null,
      isError: false,
      isPending: false,
      mutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
  });

  it('renders download button with estimated size', () => {
    const map = createMockMap();
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download/i }),
    ).toBeInTheDocument();
  });

  it('includes the global overview by default and lets the user disable it', async () => {
    const user = userEvent.setup();
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 1_000_000_000,
      sufficient: true,
    });
    const map = createMockMap({ maxZoom: 2 });
    render(<DownloadPanel map={map} />);

    const globalOverview = screen.getByRole('switch', {
      name: /global overview/i,
    });
    expect(globalOverview).toHaveAttribute('aria-checked', 'true');

    await user.click(globalOverview);
    expect(globalOverview).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: /download map/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ includeGlobalOverview: false }),
      );
    });
  });

  it('shows confirmation dialog for large downloads', async () => {
    const user = userEvent.setup();
    const map = createMockMap({ minZoom: 0, maxZoom: 22 });
    render(<DownloadPanel map={map} />);
    await user.click(screen.getByRole('button', { name: /download/i }));
    await waitFor(() => {
      expect(screen.getByText(/estimated at/i)).toBeInTheDocument();
    });
  });

  it('renders error UI when map status is error', () => {
    const map = createMockMap({
      status: 'error',
      errorMessage: 'Network failure',
    });
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-error')).toBeInTheDocument();
    expect(screen.getByText(/Network failure/)).toBeInTheDocument();
  });

  it('renders download button and estimated size for draft maps', () => {
    const map = createMockMap({ status: 'draft' });
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download map/i }),
    ).toBeInTheDocument();
  });

  it('accepts mapboxAccessToken prop', () => {
    const map = createMockMap();
    render(<DownloadPanel map={map} mapboxAccessToken="pk.test" />);
    expect(screen.getByTestId('download-panel')).toBeInTheDocument();
  });

  it('starts the download when the user bypasses a storage warning', async () => {
    const user = userEvent.setup();
    const map = createMockMap({ maxZoom: 0 });
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 0,
      sufficient: false,
    });

    render(<DownloadPanel map={map} />);

    await user.click(screen.getByRole('button', { name: /download map/i }));
    await user.click(
      await screen.findByRole('button', { name: /try anyway/i }),
    );

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledOnce();
    });

    // storageWarning must be cleared so the stale warning doesn't block the
    // ready/export card after the download finishes.
    expect(
      screen.queryByTestId('download-storage-warning'),
    ).not.toBeInTheDocument();
  });

  it('shows stuck downloading state when map status is downloading but mutation is not pending', () => {
    const map = createMockMap({ status: 'downloading' });
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-stuck')).toBeInTheDocument();
    expect(
      screen.getByText(/previous download was interrupted/i),
    ).toBeInTheDocument();
  });

  it('shows pending state when mutation is pending but no progress yet', () => {
    vi.mocked(useDownloadMap).mockReturnValue({
      error: null,
      isError: false,
      isPending: true,
      mutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    const map = createMockMap();
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-pending')).toBeInTheDocument();
    expect(screen.getByText(/starting download/i)).toBeInTheDocument();
  });

  it('shows shared progress after the panel remounts during an active download', () => {
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Test Map',
      cancel,
    });
    useMapDownloadStore.getState().updateProgress('map-1', {
      downloaded: 5,
      total: 10,
      bytes: 512000,
      skipped: 0,
    });

    const map = createMockMap();
    render(<DownloadPanel map={map} />);

    expect(screen.getByTestId('download-progress')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/5 of 10 tiles/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /download map/i }),
    ).not.toBeInTheDocument();
  });

  it('renders ready state when map status is ready', () => {
    const map = createMockMap({ status: 'ready', smpSize: 1048576 });
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-ready')).toBeInTheDocument();
    expect(screen.getByText(/downloaded successfully/i)).toBeInTheDocument();
  });

  it('does not offer regeneration when an imported ready map has lost its blob', async () => {
    const map = createMockMap({
      id: 'imported-missing',
      status: 'ready',
      type: 'style',
      styleUrl: '',
      smpBlob: undefined,
      smpSize: 100,
    });

    render(<DownloadPanel map={map} />);

    const missingState = await screen.findByTestId('download-ready-missing');
    expect(missingState).toBeInTheDocument();
    expect(within(missingState).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps regeneration available for authored ready maps with a missing blob', async () => {
    const map = createMockMap({
      id: 'authored-missing',
      status: 'ready',
      smpBlob: undefined,
      smpSize: 100,
    });

    render(<DownloadPanel map={map} />);

    const missingState = await screen.findByTestId('download-ready-missing');
    expect(
      within(missingState).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
  });

  it('renders error state when downloadMap has an error', () => {
    vi.mocked(useDownloadMap).mockReturnValue({
      error: new Error('Network timeout'),
      isError: true,
      isPending: false,
      mutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    const map = createMockMap();
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-error')).toBeInTheDocument();
    expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
  });

  it('disables retry button when max retries reached', async () => {
    const failMutateAsync = vi.fn().mockRejectedValue(new Error('Fail'));
    vi.mocked(useDownloadMap).mockReturnValue({
      error: new Error('Fail'),
      isError: true,
      isPending: false,
      mutateAsync: failMutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    const map = createMockMap();
    render(<DownloadPanel map={map} />);

    // Complete each retry cycle before starting the next one, matching the UI
    // transition through the shared starting state.
    const user = userEvent.setup();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await user.click(await screen.findByRole('button', { name: /^retry$/i }));
      await waitFor(() => {
        expect(failMutateAsync).toHaveBeenCalledTimes(attempt);
      });
    }

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /max retries reached/i }),
      ).toBeDisabled();
    });
  });

  it('skips storage warning when available is negative', async () => {
    const user = userEvent.setup();
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: -1,
      sufficient: false,
    });
    const map = createMockMap({ maxZoom: 0 });
    render(<DownloadPanel map={map} />);

    await user.click(screen.getByRole('button', { name: /download map/i }));

    // With available < 0, the warning should NOT appear, download should proceed
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledOnce();
    });
  });

  it('proceeds with download when storage quota check throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(smpDownload, 'checkStorageQuota').mockRejectedValue(
      new Error('API unavailable'),
    );
    const map = createMockMap({ maxZoom: 0 });
    render(<DownloadPanel map={map} />);

    await user.click(screen.getByRole('button', { name: /download map/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledOnce();
    });
  });

  it('handles AbortError by resetting mutation state', async () => {
    const user = userEvent.setup();
    const abortError = new DOMException('Download cancelled', 'AbortError');
    mutateAsync.mockRejectedValueOnce(abortError);

    const map = createMockMap({ maxZoom: 0 });
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 1_000_000_000,
      sufficient: true,
    });

    render(<DownloadPanel map={map} />);
    await user.click(screen.getByRole('button', { name: /download map/i }));

    await waitFor(() => {
      expect(reset).toHaveBeenCalled();
    });
  });

  it('does not abort an active download when the panel unmounts', async () => {
    const user = userEvent.setup();
    let resolveDownload: ((mapId: string) => void) | undefined;
    let signal: AbortSignal | undefined;
    const pendingMutateAsync = vi.fn(
      (options: { signal: AbortSignal }) =>
        new Promise<string>((resolve) => {
          signal = options.signal;
          resolveDownload = resolve;
        }),
    );
    vi.mocked(useDownloadMap).mockReturnValue({
      error: null,
      isError: false,
      isPending: false,
      mutateAsync: pendingMutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 1_000_000_000,
      sufficient: true,
    });

    const map = createMockMap({ maxZoom: 0 });
    const { unmount } = render(<DownloadPanel map={map} />);
    await user.click(screen.getByRole('button', { name: /download map/i }));

    await waitFor(() => {
      expect(pendingMutateAsync).toHaveBeenCalledOnce();
    });
    expect(signal).toBeDefined();

    unmount();

    expect(signal?.aborted).toBe(false);
    resolveDownload?.('map-1');
  });

  it('shows confirm dialog for large downloads and cancels', async () => {
    const user = userEvent.setup();
    const map = createMockMap({ maxZoom: 22 });
    render(<DownloadPanel map={map} />);

    // Click download to trigger large map confirm
    await user.click(screen.getByRole('button', { name: /download/i }));
    expect(screen.getByText(/may take a while/i)).toBeInTheDocument();

    // Cancel should dismiss confirm
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/may take a while/i)).not.toBeInTheDocument();
  });

  it('disables retry when pendingRef or isPending is true', async () => {
    vi.mocked(useDownloadMap).mockReturnValue({
      error: new Error('Fail'),
      isError: true,
      isPending: true,
      mutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    const map = createMockMap();
    render(<DownloadPanel map={map} />);

    // Error UI should not show while isPending is true
    expect(screen.queryByTestId('download-error')).not.toBeInTheDocument();
  });

  it('shows storage warning even when map status is error', async () => {
    const user = userEvent.setup();
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 0,
      sufficient: false,
    });
    const map = createMockMap({
      maxZoom: 2,
      status: 'error',
      errorMessage: 'Prior failure',
    });
    render(<DownloadPanel map={map} />);
    // Initial render shows the error state (storageWarning is null)
    expect(screen.getByTestId('download-error')).toBeInTheDocument();
    // Clicking retry triggers handleDownload → quota check fails → storageWarning is set
    // The storage warning should now appear, replacing the error state
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(
      await screen.findByTestId('download-storage-warning'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('download-error')).not.toBeInTheDocument();
  });

  it('does not consume retry budget when a retry is cancelled', async () => {
    const user = userEvent.setup();
    const abortError = new DOMException('Download cancelled', 'AbortError');
    const retryMutateAsync = vi.fn().mockRejectedValue(abortError);
    vi.mocked(useDownloadMap).mockReturnValue({
      error: new Error('Fail'),
      isError: true,
      isPending: false,
      mutateAsync: retryMutateAsync,
      reset,
    } as unknown as ReturnType<typeof useDownloadMap>);
    const map = createMockMap();
    render(<DownloadPanel map={map} />);

    // Retry-and-cancel three times — each cycle rejects with AbortError,
    // simulating the user cancelling a retry before it can fail.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await user.click(await screen.findByRole('button', { name: /^retry$/i }));
      await waitFor(() => {
        expect(retryMutateAsync).toHaveBeenCalledTimes(attempt);
      });
    }

    // Retry budget must remain intact — none of these were genuine failures.
    expect(
      screen.queryByRole('button', { name: /max retries reached/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retry$/i })).not.toBeDisabled();
  });

  it('shows non-large download button that triggers download directly', async () => {
    const user = userEvent.setup();
    vi.spyOn(smpDownload, 'checkStorageQuota').mockResolvedValue({
      available: 1_000_000_000,
      sufficient: true,
    });
    const map = createMockMap({ maxZoom: 2 });
    render(<DownloadPanel map={map} />);

    // Small map should go directly to download, no confirm
    await user.click(screen.getByRole('button', { name: /download map/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledOnce();
    });
  });
});
