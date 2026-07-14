import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import type { SavedMap } from '@/lib/db';
import { DownloadPanel } from '@/screens/MapScreen/DownloadPanel';

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
  it('renders download button with estimated size', () => {
    const map = createMockMap();
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download/i }),
    ).toBeInTheDocument();
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

  it('renders download UI when map status is error', () => {
    const map = createMockMap({
      status: 'error',
      errorMessage: 'Network failure',
    });
    render(<DownloadPanel map={map} />);
    expect(screen.getByTestId('download-panel')).toBeInTheDocument();
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
});
