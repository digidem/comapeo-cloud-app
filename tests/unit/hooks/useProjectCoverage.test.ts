import { describe, expect, it } from 'vitest';

import { handleCoverageMessage } from '@/hooks/useProjectCoverage';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { DEFAULTS } from '@/lib/area-calculator/config';
import type { WorkerOutMessage } from '@/lib/area-calculator/types';

const requestId = 'req-1';
const staleId = 'req-old';

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
      error: 'failed',
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
      error: 'worker crashed',
    };
    const next = handleCoverageMessage(msg, requestId, state);
    expect(next.isCalculating).toBe(false);
    expect(next.error).toBe('worker crashed');
  });
});

// Smoke test for DEFAULTS usage
it('DEFAULTS has all required keys', () => {
  expect(DEFAULTS).toHaveProperty('observedBufferMeters');
  expect(DEFAULTS).toHaveProperty('gridCellKm');
});
