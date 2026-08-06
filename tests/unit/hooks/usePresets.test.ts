import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePresets } from '@/hooks/usePresets';

const VALID_PRESETS = [
  {
    localId: '1',
    docId: 'preset-001',
    versionId: 'preset-001/0',
    originalVersionId: 'preset-001/0',
    schemaName: 'preset' as const,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    links: [],
    deleted: false,
    name: 'Deforestation',
    geometry: ['area'] as const,
    tags: { type: 'environment', category: 'forest' },
    addTags: {},
    removeTags: {},
    fieldRefs: [{ docId: 'f1', versionId: 'v1', url: '/fields/f1' }],
    iconRef: { docId: 'i1', versionId: 'v1', url: '/icons/i1' },
    color: '#FF0000',
    terms: [],
    projectLocalId: 'proj-local-1',
    sourceType: 'remote' as const,
    sourceId: 'proj-1',
    dirtyLocal: false,
  },
  {
    localId: '2',
    docId: 'preset-002',
    versionId: 'preset-002/0',
    originalVersionId: 'preset-002/0',
    schemaName: 'preset' as const,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-02-01T00:00:00Z',
    links: [],
    deleted: false,
    name: 'Water Pollution',
    geometry: ['point'] as const,
    tags: { type: 'water' },
    addTags: {},
    removeTags: {},
    fieldRefs: [{ docId: 'f2', versionId: 'v2', url: '/fields/f2' }],
    terms: [],
    projectLocalId: 'proj-local-1',
    sourceType: 'remote' as const,
    sourceId: 'proj-1',
    dirtyLocal: false,
  },
];

const mockGetPresets = vi.fn();
vi.mock('@/lib/data-layer', () => ({
  getPresets: (...args: unknown[]) => mockGetPresets(...args),
}));

describe('usePresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns presets on successful fetch', async () => {
    mockGetPresets.mockResolvedValue(VALID_PRESETS);

    const { result } = renderHook(() => usePresets('proj-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(VALID_PRESETS);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]!.name).toBe('Deforestation');
  });

  it('surfaces errors when getPresets throws', async () => {
    mockGetPresets.mockRejectedValue(new Error('Network error'));

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

    expect(result.current.isPending).toBe(true);
    expect(mockGetPresets).not.toHaveBeenCalled();
  });
});
