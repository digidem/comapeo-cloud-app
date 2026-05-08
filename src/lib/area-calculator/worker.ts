import { calculateAllMethods, extractPoints } from './calculator';
import type { WorkerInMessage, WorkerOutMessage } from './types';

export interface WorkerRequestState {
  latestRequestId: string | null;
}

const workerRequestState = createWorkerRequestState();

export function createWorkerRequestState(): WorkerRequestState {
  return { latestRequestId: null };
}

export async function handleWorkerMessage(
  event: MessageEvent<WorkerInMessage>,
  postMessage: (msg: WorkerOutMessage) => void,
  state: WorkerRequestState = workerRequestState,
): Promise<void> {
  const message = event.data;
  if (message.type !== 'calculate') return;

  const { requestId, points, params } = message;
  state.latestRequestId = requestId;

  try {
    if (!isFeatureCollection(points)) {
      throw new Error('Worker received invalid point collection');
    }

    const pointFeatures = extractPoints(points);
    const methods = calculateAllMethods(pointFeatures, params);

    for (const method of methods) {
      if (!isLatestRequest(state, requestId)) return;
      postMessage({
        type: 'progress',
        requestId,
        methodId: method.id,
        message: method.progress,
      });

      try {
        const result = method.run();
        if (!isLatestRequest(state, requestId)) return;
        postMessage({ type: 'result', requestId, result });
      } catch (err) {
        if (!isLatestRequest(state, requestId)) return;
        postMessage({
          type: 'methodError',
          requestId,
          methodId: method.id,
          message: errorMessage(err),
        });
      }

      await Promise.resolve();
    }
  } catch (err) {
    if (!isLatestRequest(state, requestId)) return;
    postMessage({ type: 'error', requestId, message: errorMessage(err) });
    return;
  }

  if (!isLatestRequest(state, requestId)) return;
  postMessage({ type: 'done', requestId });
}

function isFeatureCollection(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

function isLatestRequest(
  state: WorkerRequestState,
  requestId: string,
): boolean {
  return state.latestRequestId === requestId;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

if (
  typeof self !== 'undefined' &&
  typeof (self as unknown as { WorkerGlobalScope?: unknown })
    .WorkerGlobalScope !== 'undefined'
) {
  self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
    void handleWorkerMessage(event, (msg) => self.postMessage(msg));
  };
}
