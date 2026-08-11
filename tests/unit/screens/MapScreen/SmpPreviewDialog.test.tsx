import { act, render, screen, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const style = {
  version: 8 as const,
  sources: {},
  layers: [],
};

describe('SmpPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the SMP reader and renders the resolved map style', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);

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
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [-70, -5],
        [-60, 2],
      ],
      { padding: 50, duration: 0 },
    );
  });

  it('closes the transient reader when the dialog closes', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);

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

  it('closes a reader that finishes opening after the dialog was closed', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    let resolveReader!: (value: typeof reader) => void;
    vi.mocked(smpServe.getSmpReader).mockReturnValue(
      new Promise((resolve) => {
        resolveReader = resolve;
      }),
    );

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    expect(screen.getByText('Loading map preview…')).toBeInTheDocument();

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    await act(async () => {
      resolveReader(reader);
    });

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith('preview:map-1');
    });
    expect(smpServe.resolveSmpStyle).not.toHaveBeenCalled();
  });

  it('shows an error instead of loading forever when a ready map has no SMP blob', async () => {
    render(
      <SmpPreviewDialog
        open
        onOpenChange={vi.fn()}
        map={{ ...map, smpBlob: undefined }}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not preview this SMP.',
    );
    expect(smpServe.getSmpReader).not.toHaveBeenCalled();
  });

  it('reopens the same map in loading state until its reader is ready', async () => {
    const firstReader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValueOnce(firstReader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValueOnce(style);

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    await screen.findByTestId('smp-preview-map');

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    const secondReader = {} as Awaited<
      ReturnType<typeof smpServe.getSmpReader>
    >;
    let resolveSecondReader!: (value: typeof secondReader) => void;
    vi.mocked(smpServe.getSmpReader).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondReader = resolve;
      }),
    );
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValueOnce(style);

    rerender(<SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />);

    expect(screen.getByText('Loading map preview…')).toBeInTheDocument();
    expect(screen.queryByTestId('smp-preview-map')).not.toBeInTheDocument();

    await act(async () => {
      resolveSecondReader(secondReader);
    });

    expect(await screen.findByTestId('smp-preview-map')).toBeInTheDocument();
  });
});
