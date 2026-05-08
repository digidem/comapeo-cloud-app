import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';

import { DEFAULTS } from '@/lib/area-calculator/config';
import type {
  WorkerInMessage,
  WorkerOutMessage,
} from '@/lib/area-calculator/types';
import {
  createWorkerRequestState,
  handleWorkerMessage,
} from '@/lib/area-calculator/worker';

const testPoints = turf.featureCollection([
  turf.point([-74.006, 40.7128]),
  turf.point([-73.985, 40.758]),
  turf.point([-74.044, 40.689]),
]);

function makeEvent(msg: WorkerInMessage): MessageEvent<WorkerInMessage> {
  return { data: msg } as MessageEvent<WorkerInMessage>;
}

describe('handleWorkerMessage', () => {
  it('posts progress messages during calculation', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-1',
      points: testPoints,
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const progressMsgs = posted.filter((m) => m.type === 'progress');
    expect(progressMsgs.length).toBeGreaterThan(0);
    for (const msg of progressMsgs) {
      if (msg.type === 'progress') {
        expect(msg.requestId).toBe('req-1');
        expect(typeof msg.methodId).toBe('string');
        expect(typeof msg.message).toBe('string');
      }
    }
  });

  it('posts a result message for each method', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-2',
      points: testPoints,
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const resultMsgs = posted.filter((m) => m.type === 'result');
    expect(resultMsgs).toHaveLength(5);
    for (const msg of resultMsgs) {
      if (msg.type === 'result') {
        expect(msg.requestId).toBe('req-2');
        expect(typeof msg.result.id).toBe('string');
        expect(msg.result.areaM2).toBeGreaterThan(0);
      }
    }
  });

  it('posts a done message when complete', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-3',
      points: testPoints,
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const doneMsgs = posted.filter((m) => m.type === 'done');
    expect(doneMsgs).toHaveLength(1);
    if (doneMsgs[0]?.type === 'done') {
      expect(doneMsgs[0].requestId).toBe('req-3');
    }
  });

  it('posts methodError messages with message fields and still completes', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-method-error',
      points: { type: 'FeatureCollection', features: [] },
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const methodErrors = posted.filter((m) => m.type === 'methodError');
    expect(methodErrors.length).toBeGreaterThan(0);
    for (const msg of methodErrors) {
      if (msg.type === 'methodError') {
        expect(msg.requestId).toBe('req-method-error');
        expect(typeof msg.methodId).toBe('string');
        expect(typeof msg.message).toBe('string');
        expect('error' in msg).toBe(false);
      }
    }
    expect(posted.some((m) => m.type === 'error')).toBe(false);
    expect(posted.at(-1)).toEqual({
      type: 'done',
      requestId: 'req-method-error',
    });
  });

  it('posts fatal worker errors with message fields', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-fatal',
      points: null as unknown as typeof testPoints,
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    expect(posted).toEqual([
      {
        type: 'error',
        requestId: 'req-fatal',
        message: 'Worker received invalid point collection',
      },
    ]);
  });

  it('ignores events with non-matching type', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = {
      data: { type: 'unknown', requestId: 'req-x' },
    } as unknown as MessageEvent<WorkerInMessage>;

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    expect(posted).toHaveLength(0);
  });

  it('posts done after all results even if some methods error', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-partial',
      points: turf.featureCollection([turf.point([-74.006, 40.7128])]),
      params: { ...DEFAULTS, gridCellKm: 0 },
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const types = posted.map((m) => m.type);
    expect(types).toContain('done');
    expect(types).toContain('methodError');
    expect(types).not.toContain('error');
  });

  it('stops posting stale request messages after a newer request starts', async () => {
    const state = createWorkerRequestState();
    const posted: WorkerOutMessage[] = [];

    const staleRequest = handleWorkerMessage(
      makeEvent({
        type: 'calculate',
        requestId: 'req-old',
        points: testPoints,
        params: DEFAULTS,
      }),
      (msg) => posted.push(msg as WorkerOutMessage),
      state,
    );

    await handleWorkerMessage(
      makeEvent({
        type: 'calculate',
        requestId: 'req-new',
        points: testPoints,
        params: DEFAULTS,
      }),
      (msg) => posted.push(msg as WorkerOutMessage),
      state,
    );
    await staleRequest;

    const oldMessages = posted.filter((msg) => msg.requestId === 'req-old');
    expect(oldMessages.length).toBeLessThan(11);
    expect(oldMessages.some((msg) => msg.type === 'done')).toBe(false);
    expect(posted.at(-1)).toEqual({ type: 'done', requestId: 'req-new' });
  });
});
