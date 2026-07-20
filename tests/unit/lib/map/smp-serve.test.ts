import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAddProtocol, mockCreateServer, MockReader, mockZipReaderFrom } =
  vi.hoisted(() => {
    const MockReader = vi.fn().mockImplementation(function () {
      return {
        opened: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        getStyle: vi.fn(),
      };
    });

    return {
      mockAddProtocol: vi.fn(),
      mockCreateServer: vi.fn().mockReturnValue({
        fetch: vi
          .fn()
          .mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 })),
      }),
      MockReader,
      mockZipReaderFrom: vi.fn().mockResolvedValue({}),
    };
  });

vi.mock('maplibre-gl', () => ({
  default: { addProtocol: mockAddProtocol },
}));

vi.mock('styled-map-package-api/reader', () => ({ Reader: MockReader }));

vi.mock('styled-map-package-api/server', () => ({
  createServer: mockCreateServer,
}));

vi.mock('@gmaclennan/zip-reader', () => ({
  ZipReader: { from: mockZipReaderFrom },
}));

function importModule() {
  return import('@/lib/map/smp-serve');
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockAddProtocol.mockImplementation(() => {});
  MockReader.mockImplementation(function () {
    return {
      opened: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStyle: vi.fn(),
    };
  });
});

function createMockBlob(size = 16): Blob {
  return new Blob([new Uint8Array(size)]);
}

describe('getSmpReader', () => {
  it('creates a new Reader for a fresh mapId', async () => {
    const { getSmpReader } = await importModule();
    const blob = createMockBlob();
    const reader = await getSmpReader('map-a', blob);

    expect(MockReader).toHaveBeenCalledTimes(1);
    expect(reader.opened).toHaveBeenCalledOnce();
  });

  it('returns the cached reader on second call with the same mapId', async () => {
    const { getSmpReader } = await importModule();
    const blob = createMockBlob();
    const first = await getSmpReader('map-a', blob);
    const second = await getSmpReader('map-a', blob);

    expect(first).toBe(second);
    expect(MockReader).toHaveBeenCalledTimes(1);
  });

  it('opens a new Reader when mapId changes', async () => {
    const { getSmpReader } = await importModule();
    await getSmpReader('map-a', createMockBlob());
    await getSmpReader('map-b', createMockBlob());

    expect(MockReader).toHaveBeenCalledTimes(2);
  });
});

describe('closeSmpReader', () => {
  it('closes and removes the cached reader', async () => {
    const { getSmpReader, closeSmpReader } = await importModule();
    const reader = await getSmpReader('map-a', createMockBlob());

    await closeSmpReader('map-a');

    expect(reader.close).toHaveBeenCalledOnce();
  });

  it('subsequent getSmpReader opens a fresh reader after close', async () => {
    const { getSmpReader, closeSmpReader } = await importModule();
    const first = await getSmpReader('map-a', createMockBlob());
    await closeSmpReader('map-a');
    const second = await getSmpReader('map-a', createMockBlob());

    expect(first).not.toBe(second);
    expect(MockReader).toHaveBeenCalledTimes(2);
  });

  it('is a no-op for an unknown mapId', async () => {
    const { closeSmpReader } = await importModule();
    await expect(closeSmpReader('nonexistent')).resolves.toBeUndefined();
  });
});

describe('closeAllSmpReaders', () => {
  it('closes all cached readers and clears the cache', async () => {
    const { getSmpReader, closeAllSmpReaders } = await importModule();
    const readerA = await getSmpReader('map-a', createMockBlob());
    const readerB = await getSmpReader('map-b', createMockBlob());

    await closeAllSmpReaders();

    expect(readerA.close).toHaveBeenCalledOnce();
    expect(readerB.close).toHaveBeenCalledOnce();
  });

  it('is a no-op when no readers are cached', async () => {
    const { closeAllSmpReaders } = await importModule();
    await expect(closeAllSmpReaders()).resolves.toBeUndefined();
  });
});

describe('registerSmpProtocol', () => {
  it('calls maplibregl.addProtocol on first invocation', async () => {
    const { registerSmpProtocol } = await importModule();
    registerSmpProtocol();

    expect(mockAddProtocol).toHaveBeenCalledOnce();
    expect(mockAddProtocol).toHaveBeenCalledWith('smp', expect.any(Function));
  });

  it('is idempotent — second call does not throw or register again', async () => {
    const { registerSmpProtocol } = await importModule();
    registerSmpProtocol();
    registerSmpProtocol();

    expect(mockAddProtocol).toHaveBeenCalledOnce();
  });
});

describe('protocol handler', () => {
  it('returns empty ArrayBuffer for unknown mapId', async () => {
    const { registerSmpProtocol } = await importModule();
    registerSmpProtocol();

    const handler = mockAddProtocol.mock.calls[0]![1] as (
      request: Request,
    ) => Promise<{ data: ArrayBuffer }>;

    // mapId is extracted from url.pathname; triple-slash puts mapId in pathname
    const result = await handler(new Request('smp:///unknown/tiles/0/0/0.png'));

    expect(result.data.byteLength).toBe(0);
  });

  it('delegates to smpServer.fetch for a known mapId', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(new ArrayBuffer(4), { status: 200 }));
    mockCreateServer.mockReturnValue({ fetch: mockFetch });

    const { getSmpReader, registerSmpProtocol } = await importModule();
    await getSmpReader('map-a', createMockBlob());
    registerSmpProtocol();

    const handler = mockAddProtocol.mock.calls[0]![1] as (
      request: Request,
    ) => Promise<{ data: ArrayBuffer }>;

    // mapId is extracted from url.pathname; triple-slash puts mapId in pathname
    const result = await handler(new Request('smp:///map-a/tiles/0/0/0.png'));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.data.byteLength).toBe(4);
  });

  it('returns empty ArrayBuffer when handler throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network'));
    mockCreateServer.mockReturnValue({ fetch: mockFetch });

    const { getSmpReader, registerSmpProtocol } = await importModule();
    await getSmpReader('map-a', createMockBlob());
    registerSmpProtocol();

    const handler = mockAddProtocol.mock.calls[0]![1] as (
      request: Request,
    ) => Promise<{ data: ArrayBuffer }>;

    const result = await handler(new Request('smp:///map-a/tiles/0/0/0.png'));

    expect(result.data.byteLength).toBe(0);
  });
});

describe('resolveSmpStyle', () => {
  it('returns the style from reader.getStyle with smp:// URL', async () => {
    const mockStyle = { version: 8, sources: {}, layers: [] };

    MockReader.mockImplementation(function () {
      return {
        opened: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        getStyle: vi.fn().mockResolvedValue(mockStyle),
      };
    });

    const { getSmpReader, resolveSmpStyle } = await importModule();
    const reader = await getSmpReader('map-a', createMockBlob());
    const result = await resolveSmpStyle(reader, 'map-a');

    expect(reader.getStyle).toHaveBeenCalledWith('smp:///map-a/');
    expect(result).toEqual(mockStyle);
  });

  it('returns null when reader.getStyle throws', async () => {
    MockReader.mockImplementation(function () {
      return {
        opened: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        getStyle: vi.fn().mockRejectedValue(new Error('bad style')),
      };
    });

    const { getSmpReader, resolveSmpStyle } = await importModule();
    const reader = await getSmpReader('map-a', createMockBlob());
    const result = await resolveSmpStyle(reader, 'map-a');

    expect(result).toBeNull();
  });
});
