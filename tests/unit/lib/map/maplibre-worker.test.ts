import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSetWorkerUrl } = vi.hoisted(() => ({
  mockSetWorkerUrl: vi.fn(),
}));

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: mockSetWorkerUrl,
}));

function importModule() {
  return import('@/lib/map/maplibre-worker');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('maplibre-worker', () => {
  it('registers the Vite worker asset URL with MapLibre on import', async () => {
    await importModule();

    expect(mockSetWorkerUrl).toHaveBeenCalledTimes(1);
    const [urlArg] = mockSetWorkerUrl.mock.calls[0] ?? [];
    expect(String(urlArg)).toContain('maplibre-gl-worker');
  });
});
