import { renderHook, waitFor } from '@testing-library/react';
import type { FeatureCollection, Point } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleCoverageMessage } from '@/hooks/useProjectCoverage';
import { useProjectCoverage } from '@/hooks/useProjectCoverage';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { DEFAULTS } from '@/lib/area-calculator/config';
import type { WorkerOutMessage } from '@/lib/area-calculator/types';
import { getProjectPoints } from '@/lib/data-layer';

vi.mock('@/lib/data-layer', () => ({
  getProjectPoints: vi.fn(),
}));

const requestId = 'req-1';
const staleId = 'req-old';
const mockedGetProjectPoints = vi.mocked(getProjectPoints);

const featureCollection: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { localId: 'obs-1' },
      geometry: { type: 'Point', coordinates: [-60.5, -3.1] },
    },
  ],
};

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerOutMessage>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  emit(data: WorkerOutMessage) {
    this.onmessage?.({ data } as MessageEvent<WorkerOutMessage>);
  }
}

function makeState(): {
  results: CoverageMethodResult[];
  isCalculating: boolean;
  error: string | null;
} {
  return { results: [], isCalculating: true, error: null };
}

describe('handleCoverageMessage', () => {
  it('ignores messages with stale requestId', () => {
    const state = makeState();
    const msg: WorkerOutMessage = { type: 'done', requestId: staleId };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next).toEqual(state);
  });

  it('adds progress to matching method result', () => {
    const state = makeState();
    const msg: WorkerOutMessage = {
      type: 'progress',
      requestId,
      methodId: 'observed',
      message: 'running',
    };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.results).toHaveLength(1);
    expect(next.results[0]).toMatchObject({
      methodId: 'observed',
      progress: 'running',
    });
  });

  it('updates result for matching method', () => {
    const initial: CoverageMethodResult = {
      methodId: 'observed',
      progress: 'running',
    };
    const state = { results: [initial], isCalculating: true, error: null };
    const calcResult = {
      id: 'observed',
      label: 'Observed',
      description: '',
      featureCollection: { type: 'FeatureCollection' as const, features: [] },
      previewFeatureCollection: {
        type: 'FeatureCollection' as const,
        features: [],
      },
      areaM2: 1000,
      metadata: {},
    };
    const msg: WorkerOutMessage = {
      type: 'result',
      requestId,
      result: calcResult,
    };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.results[0]?.result).toEqual(calcResult);
  });

  it('records methodError on the matching entry', () => {
    const state = makeState();
    const msg: WorkerOutMessage = {
      type: 'methodError',
      requestId,
      methodId: 'grid',
      message: 'failed',
    };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.results[0]).toMatchObject({
      methodId: 'grid',
      error: 'failed',
    });
  });

  it('sets isCalculating false on done', () => {
    const state = makeState();
    const msg: WorkerOutMessage = { type: 'done', requestId };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.isCalculating).toBe(false);
  });

  it('sets error and isCalculating false on error', () => {
    const state = makeState();
    const msg: WorkerOutMessage = {
      type: 'error',
      requestId,
      message: 'worker crashed',
    };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.isCalculating).toBe(false);
    expect(next.error).toBe('worker crashed');
  });
});

describe('useProjectCoverage', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    mockedGetProjectPoints.mockReset();
    mockedGetProjectPoints.mockResolvedValue(featureCollection);
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('crypto', {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('req-1')
        .mockReturnValueOnce('req-2')
        .mockReturnValueOnce('req-3'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the empty state and does not create a worker when projectLocalId is null', () => {
    const { result } = renderHook(() => useProjectCoverage(null, DEFAULTS));

    expect(result.current).toEqual({
      results: [],
      isCalculating: false,
      error: null,
    });
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('posts the project FeatureCollection with params to the worker', async () => {
    renderHook(() => useProjectCoverage('project-1', DEFAULTS));

    await waitFor(() => {
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalledWith({
        type: 'calculate',
        requestId,
        points: featureCollection,
        params: DEFAULTS,
      });
    });
  });

  it('finishes with empty results and does not post to worker when no points exist', async () => {
    mockedGetProjectPoints.mockResolvedValueOnce({
      type: 'FeatureCollection',
      features: [],
    });

    const { result } = renderHook(() =>
      useProjectCoverage('project-1', DEFAULTS),
    );

    await waitFor(() => {
      expect(result.current.isCalculating).toBe(false);
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(MockWorker.instances[0]?.postMessage).not.toHaveBeenCalled();
    expect(MockWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates and recreates the worker when the project changes', async () => {
    const { rerender } = renderHook(
      ({ projectLocalId }) => useProjectCoverage(projectLocalId, DEFAULTS),
      { initialProps: { projectLocalId: 'project-1' } },
    );

    await waitFor(() => {
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled();
    });

    rerender({ projectLocalId: 'project-2' });

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(2);
    });
    expect(MockWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates and recreates the worker when refreshKey changes', async () => {
    const { rerender } = renderHook(
      ({ refreshKey }) => useProjectCoverage('project-1', DEFAULTS, refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => {
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled();
    });

    rerender({ refreshKey: 1 });

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(2);
    });
    expect(MockWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates and recreates the worker when params change', async () => {
    const { rerender } = renderHook(
      ({ gridCellKm }) =>
        useProjectCoverage('project-1', { ...DEFAULTS, gridCellKm }),
      { initialProps: { gridCellKm: DEFAULTS.gridCellKm } },
    );

    await waitFor(() => {
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled();
    });

    rerender({ gridCellKm: DEFAULTS.gridCellKm + 1 });

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(2);
    });
    expect(MockWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('ignores stale worker messages from replaced requests', async () => {
    const { result, rerender } = renderHook(
      ({ projectLocalId }) => useProjectCoverage(projectLocalId, DEFAULTS),
      { initialProps: { projectLocalId: 'project-1' } },
    );

    await waitFor(() => {
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalled();
    });

    rerender({ projectLocalId: 'project-2' });

    await waitFor(() => {
      expect(MockWorker.instances[1]?.postMessage).toHaveBeenCalled();
    });

    MockWorker.instances[0]?.emit({
      type: 'error',
      requestId: 'req-1',
      message: 'stale failure',
    });

    expect(result.current.error).toBeNull();
  });
});

// Smoke test for DEFAULTS usage
it('DEFAULTS has all required keys', () => {
  expect(DEFAULTS).toHaveProperty('observedBufferMeters');
  expect(DEFAULTS).toHaveProperty('gridCellKm');
});
