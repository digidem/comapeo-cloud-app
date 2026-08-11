import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import * as smpServe from '@/lib/map/smp-serve';
import { SmpPreviewDialog } from '@/screens/MapScreen/SmpPreviewDialog';

const fitBounds = vi.fn();

vi.mock('react-map-gl/maplibre', () => ({
  default: ({
    onLoad,
  }: {
    onLoad?: (event: { target: { fitBounds: typeof fitBounds } }) => void;
  }) => {
    onLoad?.({ target: { fitBounds } });
    return <div data-testid="smp-preview-map" />;
  },
}));

vi.mock('@/lib/map/smp-serve', () => ({
  registerSmpProtocol: vi.fn(),
  getSmpReader: vi.fn(),
  resolveSmpStyle: vi.fn(),
  closeSmpReader: vi.fn(),
}));

const map: SavedMap = {
  id: 'map-1',
  projectLocalId: 'project-1',
  name: 'Imported territory',
  type: 'style',
  styleUrl: '',
  bbox: [-70, -5, -60, 2],
  minZoom: 0,
  maxZoom: 14,
  status: 'ready',
  smpBlob: new Blob(['smp']),
  smpSize: 3,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

describe('SmpPreviewDialog', () => {
  it('opens the SMP reader and renders the resolved map style', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue({
      version: 8,
      sources: {},
      layers: [],
    });

    render(<SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />);

    expect(await screen.findByTestId('smp-preview-map')).toBeInTheDocument();
    expect(smpServe.registerSmpProtocol).toHaveBeenCalled();
    expect(smpServe.getSmpReader).toHaveBeenCalledWith(
      'preview:map-1',
      map.smpBlob,
    );
    expect(smpServe.resolveSmpStyle).toHaveBeenCalledWith(
      reader,
      'preview:map-1',
    );
  });

  it('closes the transient reader when the dialog closes', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue({
      version: 8,
      sources: {},
      layers: [],
    });

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    await screen.findByTestId('smp-preview-map');

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith('preview:map-1');
    });
  });
});
