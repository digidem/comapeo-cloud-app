import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  deduplicatePresetVersions,
  useApiPresets,
} from '@/hooks/useApiPresets';
import { normalizeCategories } from '@/hooks/useCategories';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getPresets: vi.fn(),
  },
}));

const getPresets = vi.mocked(apiClient.getPresets);

const REMOTE_ID = '4ymf7qmcafhpbmcrpdx6yxubstk66ipfq5ek5bporosi7594z8ty';

type PresetsResponse = Awaited<ReturnType<typeof apiClient.getPresets>>;
type ApiPreset = PresetsResponse['data'][number];

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function createPreset(
  overrides: Partial<ApiPreset> & Pick<ApiPreset, 'docId'>,
) {
  const createdAt = overrides.createdAt ?? '2025-01-01T00:00:00.000Z';

  return {
    schemaName: 'preset',
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    name: 'Category',
    tags: { type: 'environment' },
    fieldRefs: [],
    ...overrides,
  } satisfies ApiPreset;
}

describe('deduplicatePresetVersions', () => {
  it('groups by originalVersionId with docId fallback and preserves first-key order', () => {
    const result = deduplicatePresetVersions([
      createPreset({
        docId: 'chain-a-old',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/1',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
      createPreset({
        docId: 'fallback-one',
        versionId: 'fallback-one/1',
        createdAt: '2025-01-01T00:10:00.000Z',
      }),
      createPreset({
        docId: 'chain-b',
        originalVersionId: 'chain-b',
        versionId: 'chain-b/1',
        createdAt: '2025-01-01T00:20:00.000Z',
      }),
      createPreset({
        docId: 'chain-a-new',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/2',
        createdAt: '2025-01-01T00:40:00.000Z',
      }),
      createPreset({
        docId: 'fallback-two',
        versionId: 'fallback-two/1',
        createdAt: '2025-01-01T00:30:00.000Z',
      }),
    ]);

    expect(result.map((preset) => preset.docId)).toEqual([
      'chain-a-new',
      'fallback-one',
      'chain-b',
      'fallback-two',
    ]);
  });

  it('selects the newest parseable createdAt independent of input order', () => {
    const older = createPreset({
      docId: 'older-version',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const newer = createPreset({
      docId: 'newer-version',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/2',
      createdAt: '2025-01-01T00:05:00.000Z',
    });

    expect(deduplicatePresetVersions([older, newer])[0]?.docId).toBe(
      'newer-version',
    );
    expect(deduplicatePresetVersions([newer, older])[0]?.docId).toBe(
      'newer-version',
    );
  });

  it('ranks parseable timestamps above invalid timestamps', () => {
    const valid = createPreset({
      docId: 'valid-timestamp',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const invalid = createPreset({
      docId: 'invalid-timestamp',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/z',
      createdAt: 'not-a-date',
    });

    expect(deduplicatePresetVersions([invalid, valid])[0]?.docId).toBe(
      'valid-timestamp',
    );
    expect(deduplicatePresetVersions([valid, invalid])[0]?.docId).toBe(
      'valid-timestamp',
    );
  });

  it('uses lexical versionId when timestamps are equal or both invalid', () => {
    const missingVersion = createPreset({
      docId: 'missing-version',
      originalVersionId: 'chain-a',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const versioned = createPreset({
      docId: 'versioned',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const invalidLow = createPreset({
      docId: 'invalid-low',
      originalVersionId: 'chain-b',
      versionId: 'chain-b/1',
      createdAt: 'not-a-date',
    });
    const invalidHigh = createPreset({
      docId: 'invalid-high',
      originalVersionId: 'chain-b',
      versionId: 'chain-b/2',
      createdAt: 'also-not-a-date',
    });
    const invalidMissing = createPreset({
      docId: 'invalid-missing',
      originalVersionId: 'chain-c',
      createdAt: 'still-not-a-date',
    });
    const invalidVersioned = createPreset({
      docId: 'invalid-versioned',
      originalVersionId: 'chain-c',
      versionId: 'chain-c/1',
      createdAt: 'still-not-a-date',
    });

    expect(
      deduplicatePresetVersions([missingVersion, versioned])[0]?.docId,
    ).toBe('versioned');
    expect(deduplicatePresetVersions([invalidLow, invalidHigh])[0]?.docId).toBe(
      'invalid-high',
    );
    expect(
      deduplicatePresetVersions([invalidMissing, invalidVersioned])[0]?.docId,
    ).toBe('invalid-versioned');
  });

  it('keeps the first entry for exact ties', () => {
    const first = createPreset({
      docId: 'tie-first',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
      name: 'First tie',
    });
    const second = createPreset({
      docId: 'tie-second',
      originalVersionId: 'chain-a',
      versionId: 'chain-a/1',
      createdAt: '2025-01-01T00:00:00.000Z',
      name: 'Second tie',
    });

    expect(deduplicatePresetVersions([first, second])[0]).toBe(first);
  });

  it('retains a deleted winning version for downstream filtering', () => {
    const result = deduplicatePresetVersions([
      createPreset({
        docId: 'live-old',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/1',
        createdAt: '2025-01-01T00:00:00.000Z',
        deleted: false,
      }),
      createPreset({
        docId: 'deleted-new',
        originalVersionId: 'chain-a',
        versionId: 'chain-a/2',
        createdAt: '2025-01-01T00:05:00.000Z',
        deleted: true,
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.docId).toBe('deleted-new');
    expect(result[0]?.deleted).toBe(true);
  });
});

describe('useApiPresets', () => {
  beforeEach(() => {
    getPresets.mockReset();
    getPresets.mockResolvedValue({ data: [] });
    useAuthStore.getState().clearAll();
  });

  it('passes the active server RequestConfig (baseUrl + token) to getPresets', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getPresets).toHaveBeenCalledWith(REMOTE_ID, {
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
  });

  it('is disabled (never fetches) when no active server is configured', async () => {
    // No baseUrl set — clearAll() leaves baseUrl null.
    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    // Give the query a chance to run if it were enabled.
    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPresets).not.toHaveBeenCalled();
  });

  it('is disabled when projectRemoteId is null', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });

    const { result } = renderHook(() => useApiPresets(null), { wrapper });

    await Promise.resolve();

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPresets).not.toHaveBeenCalled();
  });

  it('exposes only the inner data array via select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockResolvedValue({
      data: [{ docId: 'p1', name: 'Forest', tags: {}, fieldRefs: [] }],
    } as never);

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { docId: 'p1', name: 'Forest', tags: {}, fieldRefs: [] },
    ]);
  });

  it('deduplicates remote preset versions by originalVersionId through select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockResolvedValue({
      data: [
        createPreset({
          docId: 'category-v1',
          originalVersionId: 'category-original',
          versionId: 'category-original/1',
          createdAt: '2025-01-01T00:00:00.000Z',
          name: 'Forest',
        }),
        createPreset({
          docId: 'category-v2',
          originalVersionId: 'category-original',
          versionId: 'category-original/2',
          createdAt: '2025-01-01T00:05:00.000Z',
          name: 'Forest updated',
        }),
      ],
    });

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.map((preset) => preset.docId)).toEqual([
      'category-v2',
    ]);
  });

  it('preserves fallback keys, distinct chains, reversed winners, and first-key order through select', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockResolvedValue({
      data: [
        createPreset({
          docId: 'chain-a-old',
          originalVersionId: 'chain-a',
          versionId: 'chain-a/1',
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
        createPreset({
          docId: 'fallback-one',
          versionId: 'fallback-one/1',
          createdAt: '2025-01-01T00:10:00.000Z',
        }),
        createPreset({
          docId: 'chain-b',
          originalVersionId: 'chain-b',
          versionId: 'chain-b/1',
          createdAt: '2025-01-01T00:20:00.000Z',
        }),
        createPreset({
          docId: 'chain-a-new',
          originalVersionId: 'chain-a',
          versionId: 'chain-a/2',
          createdAt: '2025-01-01T00:40:00.000Z',
        }),
        createPreset({
          docId: 'chain-c-new',
          originalVersionId: 'chain-c',
          versionId: 'chain-c/2',
          createdAt: '2025-01-01T00:50:00.000Z',
        }),
        createPreset({
          docId: 'chain-c-old',
          originalVersionId: 'chain-c',
          versionId: 'chain-c/1',
          createdAt: '2025-01-01T00:45:00.000Z',
        }),
        createPreset({
          docId: 'fallback-two',
          versionId: 'fallback-two/1',
          createdAt: '2025-01-01T00:30:00.000Z',
        }),
      ],
    });

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((preset) => preset.docId)).toEqual([
      'chain-a-new',
      'fallback-one',
      'chain-b',
      'chain-c-new',
      'fallback-two',
    ]);
  });

  it('normalizes deduplicated hook output to one category', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockResolvedValue({
      data: [
        createPreset({
          docId: 'category-v1',
          originalVersionId: 'category-original',
          versionId: 'category-original/1',
          createdAt: '2025-01-01T00:00:00.000Z',
          name: 'Forest',
          tags: { type: 'environment' },
        }),
        createPreset({
          docId: 'category-v2',
          originalVersionId: 'category-original',
          versionId: 'category-original/2',
          createdAt: '2025-01-01T00:05:00.000Z',
          name: 'Forest updated',
          tags: { type: 'environment' },
        }),
      ],
    });

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const groups = normalizeCategories(result.current.data ?? [], 'en', '');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.categories).toHaveLength(1);
    expect(groups[0]?.categories[0]?.docId).toBe('category-v2');
    expect(groups[0]?.categories[0]?.label).toBe('Forest updated');
  });

  it('exposes error state when getPresets rejects', async () => {
    useAuthStore.setState({
      baseUrl: 'https://archive.example.org',
      token: 'secret-token',
    });
    getPresets.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

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
    getPresets.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { result } = renderHook(() => useApiPresets(REMOTE_ID), { wrapper });

    expect(result.current.isPending || result.current.isLoading).toBe(true);

    resolvePromise({ data: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
