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
    expect(await screen.findByRole('status')).toHaveTextContent(
      'SMP imported successfully',
    );
    expect(closeSmpReader).toHaveBeenCalled();
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
