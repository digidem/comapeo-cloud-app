import { useEffect, useReducer, useRef } from 'react';

import type {
  CalculationParams,
  CalculationResult,
  WorkerOutMessage,
} from '@/lib/area-calculator/types';
import { getProjectPoints } from '@/lib/data-layer';
import { uuid } from '@/lib/uuid';

export interface CoverageMethodResult {
  methodId: string;
  result?: CalculationResult;
  error?: string;
  progress?: string;
}

interface CoverageState {
  results: CoverageMethodResult[];
  isCalculating: boolean;
  error: string | null;
}

type CoverageAction =
  | { type: 'START' }
  | { type: 'WORKER_MSG'; msg: WorkerOutMessage; requestId: string };

const EMPTY_STATE: CoverageState = {
  results: [],
  isCalculating: false,
  error: null,
};

function coverageReducer(
  state: CoverageState,
  action: CoverageAction,
): CoverageState {
  if (action.type === 'START') {
    return { results: [], isCalculating: true, error: null };
  }
  return handleCoverageMessage(action.msg, action.requestId, state);
}

export function handleCoverageMessage(
  msg: WorkerOutMessage,
  currentRequestId: string,
  state: CoverageState,
): CoverageState {
  if (msg.requestId !== currentRequestId) return state;

  switch (msg.type) {
    case 'progress': {
      const existing = state.results.find((r) => r.methodId === msg.methodId);
      if (existing) {
        return {
          ...state,
          results: state.results.map((r) =>
            r.methodId === msg.methodId ? { ...r, progress: msg.message } : r,
          ),
        };
      }
      return {
        ...state,
        results: [
          ...state.results,
          { methodId: msg.methodId, progress: msg.message },
        ],
      };
    }
    case 'result': {
      const methodId = msg.result.id;
      const existing = state.results.find((r) => r.methodId === methodId);
      if (existing) {
        return {
          ...state,
          results: state.results.map((r) =>
            r.methodId === methodId
              ? { ...r, result: msg.result as unknown as CalculationResult }
              : r,
          ),
        };
      }
      return {
        ...state,
        results: [
          ...state.results,
          { methodId, result: msg.result as unknown as CalculationResult },
        ],
      };
    }
    case 'methodError': {
      const existing = state.results.find((r) => r.methodId === msg.methodId);
      if (existing) {
        return {
          ...state,
          results: state.results.map((r) =>
            r.methodId === msg.methodId ? { ...r, error: msg.message } : r,
          ),
        };
      }
      return {
        ...state,
        results: [
          ...state.results,
          { methodId: msg.methodId, error: msg.message },
        ],
      };
    }
    case 'done':
      return { ...state, isCalculating: false };
    case 'error':
      return { ...state, isCalculating: false, error: msg.message };
    default:
      return state;
  }
}

export function useProjectCoverage(
  projectLocalId: string | null,
  params: CalculationParams,
  refreshKey: string | number = 0,
): CoverageState {
  const [state, dispatch] = useReducer(coverageReducer, EMPTY_STATE);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string>('');

  useEffect(() => {
    if (!projectLocalId) {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return;
    }

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const requestId = uuid();
    requestIdRef.current = requestId;

    dispatch({ type: 'START' });

    const worker = new Worker(
      new URL('../lib/area-calculator/worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      dispatch({
        type: 'WORKER_MSG',
        msg: event.data,
        requestId: requestIdRef.current,
      });
    };

    let aborted = false;

    worker.onerror = () => {
      if (aborted) return;
      dispatch({
        type: 'WORKER_MSG',
        msg: {
          type: 'error',
          requestId: requestIdRef.current,
          message: 'Worker failed to start',
        },
        requestId: requestIdRef.current,
      });
    };

    getProjectPoints(projectLocalId)
      .then((points) => {
        if (aborted) return;
        if (points.features.length === 0) {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          dispatch({
            type: 'WORKER_MSG',
            msg: { type: 'done', requestId },
            requestId,
          });
          return;
        }
        worker.postMessage({
          type: 'calculate',
          requestId,
          points,
          params,
        });
      })
      .catch((err: unknown) => {
        if (aborted) return;
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        dispatch({
          type: 'WORKER_MSG',
          msg: { type: 'error', requestId, message: String(err) },
          requestId,
        });
      });

    return () => {
      aborted = true;
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectLocalId, JSON.stringify(params), refreshKey]);

  if (projectLocalId === null) return EMPTY_STATE;

  return state;
}
