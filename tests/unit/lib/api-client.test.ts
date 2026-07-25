import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from '@/lib/api-client';

// Mock the stores used by api-client internals
const authStoreMock = vi.hoisted(() => ({
  state: {
    baseUrl: 'https://active.example.com' as string | null,
    token: 'active-token',
  },
  clearAuth: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      baseUrl: authStoreMock.state.baseUrl,
      token: authStoreMock.state.token,
      clearAuth: authStoreMock.clearAuth,
    }),
  },
}));

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock.clearAuth.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const makeFetchResponse = (status: number, body?: unknown) => {
    const resp = new Response(
      body !== undefined ? JSON.stringify(body) : null,
      { status },
    );
    return resp;
  };

  describe('getPresets', () => {
    it('validates and returns real presets data', async () => {
      const presetsPayload = {
        data: [
          {
            docId: 'preset-1',
            versionId: 'preset-1/0',
            originalVersionId: 'preset-1/0',
            schemaName: 'preset' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            links: [],
            deleted: false,
            name: 'Test Preset',
            geometry: ['point' as const],
            tags: { type: 'test' },
            addTags: {},
            removeTags: {},
            fieldRefs: [],
            terms: [],
          },
        ],
      };

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(200, presetsPayload));

      const result = await apiClient.getPresets('base32proj1');
      expect(result).toEqual(presetsPayload);
    });

    it('returns empty data for 404 (legacy server)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse(404, {
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
      );

      const result = await apiClient.getPresets('badproj');
      expect(result).toEqual({ data: [] });
    });

    it('throws ApiError for a 500 error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse(500, {
          error: { code: 'SERVER_ERROR', message: 'Boom' },
        }),
      );

      await expect(apiClient.getPresets('base32proj1')).rejects.toThrow(
        ApiError,
      );
    });

    it('throws ApiError for a 304 Not Modified (no cached body)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse(304));

      await expect(apiClient.getPresets('base32proj1')).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe('getFields', () => {
    it('returns empty data for 404 (legacy server)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse(404, {
          error: { code: 'NOT_FOUND', message: 'Not found' },
        }),
      );

      const result = await apiClient.getFields('badproj');
      expect(result).toEqual({ data: [] });
    });
  });

  describe('getProject — 304 regression guard', () => {
    it('throws ApiError on 304 (never resolves to wrong-shaped data)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse(304));

      // getProject returns { data: { projectId, name? } }, NOT { data: [] }.
      // A 304 must NOT silently resolve to the wrong shape.
      await expect(apiClient.getProject('base32proj1')).rejects.toThrow(
        ApiError,
      );
    });

    it('returns project detail on success', async () => {
      const projectPayload = {
        data: { projectId: 'base32proj1', name: 'Test Project' },
      };

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(200, projectPayload));

      const result = await apiClient.getProject('base32proj1');
      expect(result).toEqual(projectPayload);
    });
  });

  describe('401 auth clearing', () => {
    const error401 = {
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    };
    const alertBody = {
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    };
    const otherConfig = {
      baseUrl: 'https://other.example.com',
      token: 'other-token',
    };

    // --- handleResponse path (via getPresets) ---

    it('calls clearAuth when 401 comes from the active server (no config)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(apiClient.getPresets('project-id')).rejects.toThrow(
        ApiError,
      );
      expect(authStoreMock.clearAuth).toHaveBeenCalled();
    });

    it('does NOT call clearAuth when 401 comes from a non-active server (explicit config)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.getPresets('project-id', otherConfig),
      ).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled();
    });

    // --- createAlert path ---

    it('calls clearAuth when createAlert 401 comes from the active server (no config)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.createAlert('project-id', alertBody),
      ).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).toHaveBeenCalled();
    });

    it('does NOT call clearAuth when createAlert 401 comes from a non-active server (explicit config)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.createAlert('project-id', alertBody, otherConfig),
      ).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled();
    });
  });
});
