import { describe, expect, it } from 'vitest';

import { DEFAULTS } from '@/lib/area-calculator/config';
import type {
  CalculationResult,
  MethodDescriptor,
  WorkerInMessage,
  WorkerOutMessage,
} from '@/lib/area-calculator/types';

describe('area calculator worker types', () => {
  it('accepts the specified calculate input shape', () => {
    const msg: WorkerInMessage = {
      type: 'calculate',
      requestId: 'req-1',
      points: { type: 'FeatureCollection', features: [] },
      params: DEFAULTS,
    };

    expect(msg.points.type).toBe('FeatureCollection');
  });

  it('models lazy method descriptors separately from calculation results', () => {
    const result: CalculationResult = {
      id: 'grid',
      label: 'Grid',
      description: 'Grid result',
      featureCollection: { type: 'FeatureCollection', features: [] },
      previewFeatureCollection: { type: 'FeatureCollection', features: [] },
      areaM2: 1,
      metadata: {},
    };
    const descriptor: MethodDescriptor = {
      id: 'grid',
      progress: 'Calculating grid...',
      run: () => result,
    };

    expect(descriptor.run()).toBe(result);
  });

  it('uses message fields for method and fatal worker errors', () => {
    const methodError: WorkerOutMessage = {
      type: 'methodError',
      requestId: 'req-1',
      methodId: 'grid',
      message: 'Grid failed',
    };
    const fatalError: WorkerOutMessage = {
      type: 'error',
      requestId: 'req-1',
      message: 'Worker failed',
    };

    expect(methodError.message).toBe('Grid failed');
    expect(fatalError.message).toBe('Worker failed');
  });
});
