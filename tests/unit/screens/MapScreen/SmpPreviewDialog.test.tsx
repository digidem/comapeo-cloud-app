import { act, render, screen, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedMap } from '@/lib/db';
import * as smpServe from '@/lib/map/smp-serve';
import { SmpPreviewDialog } from '@/screens/MapScreen/SmpPreviewDialog';

const fitBounds = vi.fn();

vi.mock('react-map-gl/maplibre', () => ({
  default: ({
    onLoad,
    attributionControl,
  }: {
    onLoad?: (event: { target: { fitBounds: typeof fitBounds } }) => void;
    attributionControl?: boolean;
  }) => {
    onLoad?.({ target: { fitBounds } });
    return (
      <div
        data-testid="smp-preview-map"
        data-attribution-control={
          attributionControl === false ? 'false' : 'true'
        }
      />
    );
  },
}));

vi.mock('@/lib/map/smp-serve', () => ({
  registerSmpProtocol: vi.fn(),
  getSmpReader: vi.fn(),
  resolveSmpStyle: vi.fn(),
  sanitizeImportedSmpStyle: vi.fn((style) => style),
  closeSmpReader: vi.fn().mockResolvedValue(undefined),
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

    const previewMap = await screen.findByTestId('smp-preview-map');
    expect(previewMap).toBeInTheDocument();
    expect(previewMap).toHaveAttribute('data-attribution-control', 'true');
    expect(
      screen.getByRole('region', { name: 'Preview map' }),
    ).toBeInTheDocument();
    expect(smpServe.registerSmpProtocol).toHaveBeenCalled();
    const readerId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];
    expect(readerId).toMatch(/^preview:map-1:/);
    expect(smpServe.getSmpReader).toHaveBeenCalledWith(readerId, map.smpBlob);
    expect(smpServe.resolveSmpStyle).toHaveBeenCalledWith(reader, readerId);
    expect(smpServe.sanitizeImportedSmpStyle).toHaveBeenCalledWith(style);
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [-70, -5],
        [-60, 2],
      ],
      { padding: 50, duration: 0 },
    );
  });

  it('shows an error when an imported style is not safe for offline rendering', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);
    vi.mocked(smpServe.sanitizeImportedSmpStyle).mockReturnValueOnce(null);

    render(<SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not preview this SMP.',
    );
    expect(screen.queryByTestId('smp-preview-map')).not.toBeInTheDocument();
  });

  it('closes the transient reader when the dialog closes', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    await screen.findByTestId('smp-preview-map');
    const readerId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith(readerId);
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
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading map preview…',
    );
    const readerId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    await act(async () => {
      resolveReader(reader);
    });

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith(readerId);
    });
    expect(smpServe.resolveSmpStyle).not.toHaveBeenCalled();
  });

  it('swallows reader cleanup failures when the dialog closes', async () => {
    const reader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(reader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);
    vi.mocked(smpServe.closeSmpReader).mockRejectedValueOnce(
      new Error('close failed'),
    );

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    await screen.findByTestId('smp-preview-map');
    const readerId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith(readerId);
    });
  });

  it('uses a new reader cache key when reopened before the prior reader finishes', async () => {
    const firstReader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    let resolveFirstReader!: (value: typeof firstReader) => void;
    vi.mocked(smpServe.getSmpReader)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstReader = resolve;
        }),
      )
      .mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
      );
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValue(style);

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    const firstReaderId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];

    rerender(
      <SmpPreviewDialog open={false} onOpenChange={vi.fn()} map={map} />,
    );
    rerender(<SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />);

    expect(await screen.findByTestId('smp-preview-map')).toBeInTheDocument();
    const secondReaderId = vi.mocked(smpServe.getSmpReader).mock.calls[1]![0];
    expect(secondReaderId).not.toBe(firstReaderId);

    await act(async () => {
      resolveFirstReader(firstReader);
    });

    await waitFor(() => {
      expect(smpServe.closeSmpReader).toHaveBeenCalledWith(firstReaderId);
    });
    expect(smpServe.closeSmpReader).not.toHaveBeenCalledWith(secondReaderId);
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

  it('shows loading rather than stale style when the preview target changes', async () => {
    const firstReader = {} as Awaited<ReturnType<typeof smpServe.getSmpReader>>;
    vi.mocked(smpServe.getSmpReader).mockResolvedValueOnce(firstReader);
    vi.mocked(smpServe.resolveSmpStyle).mockResolvedValueOnce(style);

    const { rerender } = render(
      <SmpPreviewDialog open onOpenChange={vi.fn()} map={map} />,
    );
    await screen.findByTestId('smp-preview-map');

    const secondMap = {
      ...map,
      id: 'map-2',
      name: 'Second territory',
      updatedAt: '2026-08-10T01:00:00.000Z',
    };
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

    rerender(<SmpPreviewDialog open onOpenChange={vi.fn()} map={secondMap} />);

    expect(screen.getByText('Loading map preview…')).toBeInTheDocument();
    expect(screen.queryByTestId('smp-preview-map')).not.toBeInTheDocument();

    await act(async () => {
      resolveSecondReader(secondReader);
    });
    expect(await screen.findByTestId('smp-preview-map')).toBeInTheDocument();
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
