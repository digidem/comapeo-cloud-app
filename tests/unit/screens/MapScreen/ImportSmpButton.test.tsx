import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as useMaps from '@/hooks/useMaps';
import * as smpDownload from '@/lib/map/smp-download';
import * as smpServe from '@/lib/map/smp-serve';
import { ImportSmpButton } from '@/screens/MapScreen/ImportSmpButton';

const mutateAsync = vi.fn();
const closeSmpReader = vi.fn();

vi.mock('@/hooks/useMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMaps')>();
  return {
    ...actual,
    useCreateMap: vi.fn(),
  };
});

vi.mock('@/lib/map/smp-serve', () => ({
  getSmpReader: vi.fn(),
  closeSmpReader: (...args: unknown[]) => closeSmpReader(...args),
  resolveSmpStyle: vi.fn(
    async (
      reader: { getStyle: (baseUrl?: string) => Promise<unknown> },
      mapId: string,
    ) => {
      try {
        return await reader.getStyle(`smp:///${mapId}/`);
      } catch {
        return null;
      }
    },
  ),
  sanitizeImportedSmpStyle: vi.fn((style) => style),
  sanitizeSmpAttributionText: (value: string) =>
    value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
}));

vi.mock('@/lib/map/smp-download', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/map/smp-download')>();
  return {
    ...actual,
    checkStorageQuota: vi.fn(),
  };
});

function readerWithStyle(style: Record<string, unknown>) {
  return {
    opened: vi.fn().mockResolvedValue(undefined),
    getVersion: vi.fn().mockResolvedValue('1'),
    getStyle: vi.fn().mockResolvedValue(style),
  };
}

describe('ImportSmpButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(undefined);
    vi.mocked(useMaps.useCreateMap).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMaps.useCreateMap>);
    vi.mocked(smpDownload.checkStorageQuota).mockResolvedValue({
      available: 1_000_000,
      sufficient: true,
    });
  });

  it('creates a ready SavedMap from a valid SMP file', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({
      version: 8,
      metadata: { name: 'Shared territory' },
      sources: {
        raster: {
          type: 'raster',
          bounds: [-70, -5, -60, 2],
          attribution: 'Community imagery',
          minzoom: 2,
          maxzoom: 12,
        },
      },
      layers: [],
    });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );
    mutateAsync.mockResolvedValue(undefined);

    render(<ImportSmpButton projectLocalId="project-1" />);
    const input = screen.getByLabelText('Import SMP file');
    expect(input).toHaveAttribute('tabindex', '-1');
    const file = new File(['valid'], 'shared-map.smp', {
      type: 'application/zip',
    });

    await user.upload(input, file);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocalId: 'project-1',
        name: 'Shared territory',
        type: 'style',
        bbox: [-70, -5, -60, 2],
        minZoom: 2,
        maxZoom: 12,
        attribution: 'Community imagery',
        status: 'ready',
        smpBlob: file,
        smpSize: file.size,
      }),
    );
    const savedMap = mutateAsync.mock.calls[0]![0] as { id: string };
    const readerId = vi.mocked(smpServe.getSmpReader).mock.calls[0]![0];
    expect(readerId).toMatch(/^import:/);
    expect(readerId).not.toBe(savedMap.id);
    expect(smpServe.resolveSmpStyle).toHaveBeenCalledWith(reader, readerId);
    expect(reader.getStyle).toHaveBeenCalledWith(`smp:///${readerId}/`);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'SMP imported successfully',
    );
    expect(closeSmpReader).toHaveBeenCalled();
  });

  it('sanitizes imported attribution before persisting the SavedMap', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          attribution:
            '<a href="https://example.com" onclick="alert(1)">Community & Forest</a>',
        },
      },
      layers: [],
    });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'attribution.smp', { type: 'application/zip' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ attribution: 'Community & Forest' }),
    );
  });

  it('schedules the success announcement to dismiss after import', async () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    const user = userEvent.setup();
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'success.smp', { type: 'application/zip' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'SMP imported successfully',
    );
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4000);
    timeoutSpy.mockRestore();
  });

  it('prefers SMP metadata bounds over source bounds when available', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({
      version: 8,
      metadata: {
        name: 'Round trip',
        'smp:bounds': [-180, -90, 180, 90],
        'smp:regionalBounds': [-68, -4, -62, 1],
      },
      sources: {
        raster: {
          type: 'raster',
          bounds: [-70, -5, -60, 2],
        },
      },
      layers: [],
    });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'round-trip.smp', { type: 'application/zip' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ bbox: [-68, -4, -62, 1] }),
    );
  });

  it('falls back to safe zoom defaults when imported zoom metadata is invalid', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          minzoom: 20,
          maxzoom: 1e12,
        },
      },
      layers: [],
    });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'bad-zoom.smp', { type: 'application/zip' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ minZoom: 0, maxZoom: 14 }),
    );
  });

  it('normalizes imported SMP files to an application/zip blob', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    const file = new File(['valid'], 'shared-map.smp');
    await user.upload(screen.getByLabelText('Import SMP file'), file);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const savedMap = mutateAsync.mock.calls[0]![0] as { smpBlob: Blob };
    expect(savedMap.smpBlob).toBeInstanceOf(Blob);
    expect(savedMap.smpBlob.type).toBe('application/zip');
  });

  it('shows an invalid-file error and creates nothing when the reader cannot open', async () => {
    const user = userEvent.setup();
    vi.mocked(smpServe.getSmpReader).mockRejectedValue(
      new Error('invalid zip'),
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    const file = new File(['invalid'], 'bad.smp', { type: 'application/zip' });
    await user.upload(screen.getByLabelText('Import SMP file'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not a valid SMP',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('rejects an SMP that depends on resources outside the package', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          tiles: ['https://tracker.example/{z}/{x}/{y}.png'],
        },
      },
      layers: [],
    });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );
    vi.mocked(smpServe.sanitizeImportedSmpStyle).mockReturnValueOnce(null);

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'remote-resources.smp', {
        type: 'application/zip',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This SMP contains map resources that are not packaged for offline use',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('continues validation when the storage quota probe itself fails', async () => {
    const user = userEvent.setup();
    vi.mocked(smpDownload.checkStorageQuota).mockRejectedValue(
      new Error('storage estimate unavailable'),
    );
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'quota-unknown.smp', { type: 'application/zip' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects an SMP that would exceed available storage', async () => {
    const user = userEvent.setup();
    vi.mocked(smpDownload.checkStorageQuota).mockResolvedValue({
      available: 1,
      sufficient: false,
    });

    render(<ImportSmpButton projectLocalId="project-1" />);
    const file = new File(['too-large'], 'large.smp', {
      type: 'application/zip',
    });
    await user.upload(screen.getByLabelText('Import SMP file'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not enough storage space to import this SMP',
    );
    expect(smpServe.getSmpReader).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a save error instead of calling a valid SMP invalid when persistence fails', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );
    mutateAsync.mockRejectedValueOnce(new Error('IndexedDB write failed'));

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'valid.smp', { type: 'application/zip' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save map. Please try again.',
    );
    expect(closeSmpReader).toHaveBeenCalled();
  });

  it('shows quota-exceeded when IndexedDB rejects the final save for quota', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );
    const quotaError = new Error('quota');
    quotaError.name = 'QuotaExceededError';
    mutateAsync.mockRejectedValueOnce(quotaError);

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'valid.smp', { type: 'application/zip' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not enough storage space to import this SMP',
    );
  });

  it('recovers the import button when transient reader cleanup fails', async () => {
    const user = userEvent.setup();
    const reader = readerWithStyle({ version: 8, sources: {}, layers: [] });
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );
    closeSmpReader.mockRejectedValueOnce(new Error('close failed'));

    render(<ImportSmpButton projectLocalId="project-1" />);
    await user.upload(
      screen.getByLabelText('Import SMP file'),
      new File(['valid'], 'valid.smp', { type: 'application/zip' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'SMP imported successfully',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Import SMP' })).toBeEnabled();
    });
  });

  it('shows a missing-style error and creates nothing when the SMP has no style', async () => {
    const user = userEvent.setup();
    const reader = {
      opened: vi.fn().mockResolvedValue(undefined),
      getVersion: vi.fn().mockResolvedValue('1'),
      getStyle: vi.fn().mockRejectedValue(new Error('missing style')),
    };
    vi.mocked(smpServe.getSmpReader).mockResolvedValue(
      reader as unknown as Awaited<ReturnType<typeof smpServe.getSmpReader>>,
    );

    render(<ImportSmpButton projectLocalId="project-1" />);
    const file = new File(['nostyle'], 'no-style.smp', {
      type: 'application/zip',
    });
    await user.upload(screen.getByLabelText('Import SMP file'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'SMP has no map style',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(closeSmpReader).toHaveBeenCalled();
  });
});
