import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MapDownloadStatus } from '@/screens/MapScreen/MapDownloadStatus';
import { useMapDownloadStore } from '@/stores/map-download-store';

describe('MapDownloadStatus', () => {
  beforeEach(() => {
    useMapDownloadStore.setState({ active: null });
  });

  it('is hidden when there is no active download', () => {
    render(<MapDownloadStatus />);

    expect(screen.queryByTestId('map-download-status')).not.toBeInTheDocument();
  });

  it('shows a persistent starting state and lets the user cancel', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Forest Map',
      cancel,
    });

    render(<MapDownloadStatus />);

    expect(screen.getByTestId('map-download-status')).toBeInTheDocument();
    expect(screen.getByText('Forest Map')).toBeInTheDocument();
    expect(screen.getByText(/starting download/i)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('updates the visible progress from shared download state', () => {
    useMapDownloadStore.getState().start({
      mapId: 'map-1',
      mapName: 'Forest Map',
      cancel: vi.fn(),
    });
    useMapDownloadStore.getState().updateProgress('map-1', {
      downloaded: 5,
      total: 10,
      bytes: 1024,
      skipped: 0,
    });

    render(<MapDownloadStatus />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/5 of 10 tiles/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 KB/i)).toBeInTheDocument();
  });
});
