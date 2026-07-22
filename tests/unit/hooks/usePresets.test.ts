import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@tests/mocks/test-utils';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePresets } from '@/hooks/usePresets';
import { useAuthStore } from '@/stores/auth-store';

const VALID_PRESETS = {
  data: [
    {
      docId: 'preset-001',
      versionId: 'preset-001/0',
      originalVersionId: 'preset-001/0',
      schemaName: 'preset' as const,
      createdAt: '2024-03-15T10:00:00Z',
      updatedAt: '2024-03-15T10:00:00Z',
      links: [],
      deleted: false,
      name: 'Deforestation',
      geometry: ['point', 'area'] as const,
      tags: { category: 'forest', type: 'environment' },
      addTags: {},
      removeTags: {},
      fieldRefs: [],
      terms: ['logging', 'clear-cut'],
    },
    {
      docId: 'preset-002',
      versionId: 'preset-002/0',
      originalVersionId: 'preset-002/0',
      schemaName: 'preset' as const,
      createdAt: '2024-03-14T14:00:00Z',
      updatedAt: '2024-03-14T14:00:00Z',
      links: [],
      deleted: false,
      name: 'Water Contamination',
      geometry: ['point'] as const,
      tags: { category: 'water-risk', type: 'water' },
      addTags: {},
      removeTags: {},
      fieldRefs: [],
      terms: ['river', 'pollution'],
    },
  ],
};

describe('usePresets', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', baseUrl: 'http://localhost' });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, baseUrl: null });
  });

  it('returns presets on successful fetch', async () => {
    const { server } = await import('@tests/mocks/node');
    server.use(
      http.get('*/projects/*/preset', () => {
        return HttpResponse.json(VALID_PRESETS);
      }),
    );

    const { result } = renderHook(() => usePresets('proj-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(VALID_PRESETS.data);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]!.name).toBe('Deforestation');
  });

  it('surfaces HTTP 500 errors in error state', async () => {
    const { server } = await import('@tests/mocks/node');
    server.use(
      http.get('*/projects/*/preset', () => {
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'Server error' } },
          { status: 500 },
        );
      }),
    );

    const { result } = renderHook(() => usePresets('proj-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('surfaces network errors in error state', async () => {
    const { server } = await import('@tests/mocks/node');
    server.use(
      http.get('*/projects/*/preset', () => {
        return HttpResponse.error();
      }),
    );

    const { result } = renderHook(() => usePresets('proj-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('surfaces schema validation errors when payload is invalid', async () => {
    const { server } = await import('@tests/mocks/node');
    server.use(
      http.get('*/projects/*/preset', () => {
        return HttpResponse.json({ data: 'not-an-array' });
      }),
    );

    const { result } = renderHook(() => usePresets('proj-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('does not fetch when projectLocalId is null', () => {
    const { result } = renderHook(() => usePresets(null), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.status).toBe('pending');
  });
});
