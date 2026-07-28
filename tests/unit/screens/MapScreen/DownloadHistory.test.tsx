import { fireEvent, screen } from '@testing-library/react';
import { render } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/components/ui/toast';
import { useDownloadMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { formatBytes } from '@/lib/map/smp-download';
import { DownloadHistory } from '@/screens/MapScreen/DownloadHistory';

type ToastReturn = ReturnType<typeof useToast>;
type MutateOpts = {
  onSuccess?: (d: unknown) => void;
  onError?: (e: unknown) => void;
};

const { mutate, addToast } = vi.hoisted(() => ({
  mutate: vi.fn<(vars: { map: SavedMap }, opts?: MutateOpts) => void>(),
  addToast: vi.fn(),
}));

vi.mock('@/hooks/useMaps', () => ({ useDownloadMap: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: vi.fn() }));

const makeMap = (over: Partial<SavedMap> = {}): SavedMap =>
  ({
    id: 'm1',
    projectLocalId: 'p1',
    name: 'Test Map',
    type: 'style',
    styleUrl: 'https://example.com/style',
    bbox: [0, 0, 0, 0],
    minZoom: 0,
    maxZoom: 14,
    status: 'ready',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...over,
  }) as SavedMap;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDownloadMap).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useDownloadMap>);
  vi.mocked(useToast).mockReturnValue({ addToast } as unknown as ToastReturn);
});

describe('DownloadHistory', () => {
  it('renders the title and two skeletons while loading', () => {
    render(<DownloadHistory maps={[]} isLoading />);
    expect(screen.getByText(/download history/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton')).toHaveLength(2);
  });

  it('renders the empty message when there are no completed downloads', () => {
    render(<DownloadHistory maps={[]} />);
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });

  it('renders a ready map with its size and Ready status', () => {
    render(
      <DownloadHistory
        maps={[makeMap({ id: 'ready1', status: 'ready', smpSize: 1048576 })]}
      />,
    );
    expect(screen.getByText('Test Map')).toBeInTheDocument();
    const sizeText = screen.getByText(/size:/i);
    expect(sizeText.textContent).toContain(formatBytes(1048576));
    expect(screen.getByText(/^ready$/i)).toBeInTheDocument();
  });

  it('renders an error map with its message and a retry button', () => {
    render(
      <DownloadHistory
        maps={[
          makeMap({
            id: 'err1',
            status: 'error',
            errorMessage: 'Network failure',
          }),
        ]}
      />,
    );
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls downloadMap.mutate with the map when retry is clicked', () => {
    render(
      <DownloadHistory
        maps={[makeMap({ id: 'err1', status: 'error', errorMessage: 'x' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mutate).toHaveBeenCalledWith(
      { map: expect.objectContaining({ id: 'err1' }) },
      expect.anything(),
    );
  });

  it('fires a success toast via onSuccess', () => {
    mutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.(undefined);
    });
    render(
      <DownloadHistory
        maps={[
          makeMap({
            id: 'err1',
            status: 'error',
            errorMessage: 'x',
            smpSize: 1048576,
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('fires an error toast via onError', () => {
    mutate.mockImplementation((_vars, opts) => {
      opts?.onError?.(new Error('boom'));
    });
    render(
      <DownloadHistory
        maps={[makeMap({ id: 'err1', status: 'error', errorMessage: 'x' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        title: expect.stringContaining('boom'),
      }),
    );
  });

  it('does not render a Size line for a ready map without smpSize', () => {
    render(
      <DownloadHistory maps={[makeMap({ id: 'ready2', status: 'ready' })]} />,
    );
    expect(screen.queryByText(/size:/i)).toBeNull();
    expect(screen.getByText(/^ready$/i)).toBeInTheDocument();
  });
});
