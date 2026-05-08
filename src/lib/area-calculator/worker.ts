import { calculateAllMethods, extractPoints } from './calculator';
import type { WorkerInMessage, WorkerOutMessage } from './types';

export async function handleWorkerMessage(
  event: MessageEvent<WorkerInMessage>,
  postMessage: (msg: WorkerOutMessage) => void,
): Promise<void> {
  const message = event.data;
  if (message.type !== 'calculate') return;

  const { requestId, geojson, params } = message;

  try {
    const points = extractPoints(geojson);

    const methods = calculateAllMethods(points, params, (methodId, msg) => {
      postMessage({ type: 'progress', requestId, methodId, message: msg });
    });

    for (const result of methods) {
      postMessage({ type: 'result', requestId, result });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'error', requestId, error });
    return;
  }

  postMessage({ type: 'done', requestId });
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
