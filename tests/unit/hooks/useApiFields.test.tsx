import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { deduplicateFieldVersions, useApiFields } from '@/hooks/useApiFields';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getFields: vi.fn(),
  },
}));

const getFields = vi.mocked(apiClient.getFields);

const REMOTE_ID = '4ymf7qmcafhpbmcrpdx6yxubstk66ipfq5ek5bporosi7594z8ty';

type FieldsResponse = Awaited<ReturnType<typeof apiClient.getFields>>;
type ApiField = FieldsResponse['data'][number];

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function createField(
  overrides: Partial<ApiField> & Pick<ApiField, 'docId'>,
): ApiField {
  const createdAt = overrides.createdAt ?? '2025-01-01T00:00:00.000Z';

  return {
    schemaName: 'field',
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    type: 'text',
    key: 'test_key',
    label: 'Test Field',
    universal: false,
    ...overrides,
  } satisfies ApiField;
}

describe('deduplicateFieldVersions', () => {
  it('groups by originalVersionId with docId fallback and preserves first-key order', () => {
    const result = deduplicateFieldVersions([
      createField({
        docId: 'chain-a-old',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/1',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
      createField({
        docId: 'fallback-one',
        versionId: 'fallback-one/1',
        createdAt: '2025-01-01T00:10:00.000Z',
      }),
      createField({
        docId: 'chain-b',
        originalVersionId: 'chain-b',
        versionId: 'chain-b/1',
        createdAt: '2025-01-01T00:20:00.000Z',
      }),
      createField({
        docId: 'chain-a-new',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/2',
        createdAt: '2025-01-01T00:40:00.000Z',
      }),
      createField({
        docId: 'fallback-two',
        versionId: 'fallback-two/1',
        createdAt: '2025-01-01T00:30:00.000Z',
      }),
    ]);

    expect(result.map((field) => field.docId)).toEqual([
      'chain-a-new',
      'fallback-one',
      'chain-b',
      'fallback-two',
    ]);
  });

  it('selects the newest parseable createdAt independent of input order', () => {
    const older = createField({
      docId: 'older-version',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const newer = createField({
      docId: 'newer-version',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/2',
      createdAt: '2025-01-01T00:05:00.000Z',
    });

    expect(deduplicateFieldVersions([older, newer])[0]?.docId).toBe(
      'newer-version',
    );
    expect(deduplicateFieldVersions([newer, older])[0]?.docId).toBe(
      'newer-version',
    );
  });

  it('keeps the first entry for exact ties', () => {
    const first = createField({
      docId: 'tie-first',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const second = createField({
      docId: 'tie-second',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    expect(deduplicateFieldVersions([first, second])[0]).toBe(first);
  });
});

describe('useApiFields', () => {
  beforeEach(() => {
    getFields.mockReset();
    getFields.mockResolvedValue({ data: [] });
    useAuthStore.getState().clearAll();
  });

  it('passes the active server RequestConfig (baseUrl + token) to getFields', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getFields).toHaveBeenCalledWith(REMOTE_ID, {
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
  });

  it('is disabled (never fetches) when no active server is configured', async () => {
    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getFields).not.toHaveBeenCalled();
  });

  it('is disabled when projectRemoteId is null', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiFields(null), { wrapper });

    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getFields).not.toHaveBeenCalled();
  });

  it('exposes only the inner data array via select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getFields.mockResolvedValue({
      data: [{ docId: 'f1', name: 'Severity' } as never],
    });

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ docId: 'f1', name: 'Severity' }]);
  });

  it('filters out deleted fields through select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getFields.mockResolvedValue({
      data: [
        createField({ docId: 'f1', deleted: false }),
        createField({ docId: 'f2', deleted: true }),
        createField({ docId: 'f3', deleted: false }),
      ],
    });

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map((f) => f.docId)).toEqual(['f1', 'f3']);
  });

  it('deduplicates field versions by originalVersionId through select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getFields.mockResolvedValue({
      data: [
        createField({
          docId: 'field-v1',
          originalVersionId: 'field-original',
          versionId: 'field-original/1',
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
        createField({
          docId: 'field-v2',
          originalVersionId: 'field-original',
          versionId: 'field-original/2',
          createdAt: '2025-01-01T00:05:00.000Z',
        }),
      ],
    });

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.map((f) => f.docId)).toEqual(['field-v2']);
  });

  it('exposes error state when getFields rejects', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getFields.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Network Error');
  });

  it('transitions through loading state', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolvePromise!: (value: any) => void;
    getFields.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    expect(result.current.isPending || result.current.isLoading).toBe(true);

    resolvePromise({ data: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('exposes isEnabled flag matching enabled state', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    expect(result.current.isEnabled).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('exposes isEnabled=false when disabled', async () => {
    const { result } = renderHook(() => useApiFields(REMOTE_ID), { wrapper });

    expect(result.current.isEnabled).toBe(false);
  });
});
