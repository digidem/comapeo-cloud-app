import * as turf from '@turf/turf';
import { describe, expect, it } from 'vitest';

import { DEFAULTS } from '@/lib/area-calculator/config';
import type {
  WorkerInMessage,
  WorkerOutMessage,
} from '@/lib/area-calculator/types';
import { handleWorkerMessage } from '@/lib/area-calculator/worker';

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
      geojson: testPoints,
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
      geojson: testPoints,
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
      geojson: testPoints,
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

  it('posts an error message when calculation fails', async () => {
    const posted: WorkerOutMessage[] = [];
    const event = makeEvent({
      type: 'calculate',
      requestId: 'req-err',
      geojson: { type: 'FeatureCollection', features: [] },
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const errorOrDone = posted.filter(
      (m) =>
        m.type === 'error' || m.type === 'methodError' || m.type === 'done',
    );
    expect(errorOrDone.length).toBeGreaterThan(0);
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
      geojson: turf.featureCollection([turf.point([-74.006, 40.7128])]),
      params: DEFAULTS,
    });

    await handleWorkerMessage(event, (msg) =>
      posted.push(msg as WorkerOutMessage),
    );

    const types = posted.map((m) => m.type);
    expect(types).toContain('done');
  });
});
