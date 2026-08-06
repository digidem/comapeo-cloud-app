import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient, getAttachmentUrl } from '@/lib/api-client';

// Mock the stores used by api-client internals
const authStoreMock = vi.hoisted(() => ({
  state: {
    activeServerId: 'active-server' as string | null,
    servers: [
      {
        id: 'active-server',
        label: 'Active Server',
        baseUrl: 'https://active.example.com',
        token: 'active-token',
        status: 'connected' as const,
      },
    ],
    baseUrl: 'https://active.example.com' as string | null,
    token: 'active-token' as string | null,
  },
  clearAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/auth-store', () => {
  const selectActiveServer = (state: typeof authStoreMock.state) =>
    state.servers.find((server) => server.id === state.activeServerId) ?? null;

  return {
    selectActiveServer,
    selectActiveBaseUrl: (state: typeof authStoreMock.state) =>
      selectActiveServer(state)?.baseUrl ?? state.baseUrl,
    selectActiveToken: (state: typeof authStoreMock.state) =>
      selectActiveServer(state)?.token ?? state.token,
    useAuthStore: {
      getState: () => ({
        ...authStoreMock.state,
        clearAuth: authStoreMock.clearAuth,
      }),
    },
  };
});

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock.clearAuth.mockClear();
    authStoreMock.state.activeServerId = 'active-server';
    authStoreMock.state.servers = [
      {
        id: 'active-server',
        label: 'Active Server',
        baseUrl: 'https://active.example.com',
        token: 'active-token',
        status: 'connected',
      },
    ];
    authStoreMock.state.baseUrl = 'https://active.example.com';
    authStoreMock.state.token = 'active-token';
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

    it('returns unsupported semantics for a legacy route 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse(404, {
          message: 'Route GET:/projects/badproj/preset not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      );

      const result = await apiClient.getPresets('badproj');
      expect(result).toEqual({ data: [] });
      expect(result.semantics?.availability).toBe('unsupported');
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
    it('returns unsupported semantics for a legacy route 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse(404, {
          message: 'Route GET:/projects/badproj/field not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      );

      const result = await apiClient.getFields('badproj');
      expect(result).toEqual({ data: [] });
      expect(result.semantics?.availability).toBe('unsupported');
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
      expect(authStoreMock.clearAuth).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://active.example.com',
        token: 'active-token',
      });
    });

    it('passes non-active request identity to the atomic clear operation', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.getPresets('project-id', otherConfig),
      ).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://other.example.com',
        token: 'other-token',
      });
    });

    it('does NOT clear server B when a delayed 401 from server A used the same token', async () => {
      let resolveResponse!: (response: Response) => void;
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      );

      const request = apiClient.getPresets('project-id');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://active.example.com/projects/project-id/preset',
        expect.any(Object),
      );

      authStoreMock.state.activeServerId = 'server-b';
      authStoreMock.state.servers = [
        {
          id: 'server-b',
          label: 'Server B',
          baseUrl: 'https://server-b.example.com',
          token: 'active-token',
          status: 'connected',
        },
      ];
      authStoreMock.state.baseUrl = 'https://server-b.example.com';

      resolveResponse(makeFetchResponse(401, error401));

      await expect(request).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://active.example.com',
        token: 'active-token',
      });
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

    it('passes configured createAlert identity to the atomic clear operation', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.createAlert('project-id', alertBody, otherConfig),
      ).rejects.toThrow(ApiError);
      expect(authStoreMock.clearAuth).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://other.example.com',
        token: 'other-token',
      });
    });

    it('passes captured identity for getIcon 401 responses', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(apiClient.getIcon('project-id', 'icon-id')).rejects.toThrow(
        ApiError,
      );
      expect(authStoreMock.clearAuth).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://active.example.com',
        token: 'active-token',
      });
    });

    // --- cleanup failures must not mask the original 401 ---

    describe('when clearAuth fails', () => {
      const dbError = new Error('DbError: IndexedDB update failed');
      let consoleError: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.fetch = vi
          .fn()
          .mockResolvedValue(makeFetchResponse(401, error401));
      });

      afterEach(() => {
        consoleError.mockRestore();
      });

      const expect401 = async (promise: Promise<unknown>) => {
        const error = await promise.then(
          () => null,
          (thrown: unknown) => thrown,
        );
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
        expect(consoleError).toHaveBeenCalled();
      };

      it('still throws ApiError(401) from handleResponse', async () => {
        authStoreMock.clearAuth.mockRejectedValueOnce(dbError);
        await expect401(apiClient.getPresets('project-id'));
      });

      it('still throws ApiError(401) from createAlert', async () => {
        authStoreMock.clearAuth.mockRejectedValueOnce(dbError);
        await expect401(apiClient.createAlert('project-id', alertBody));
      });

      it('still throws ApiError(401) from getIcon', async () => {
        authStoreMock.clearAuth.mockRejectedValueOnce(dbError);
        await expect401(apiClient.getIcon('project-id', 'icon-id'));
      });
    });
  });

  describe('captured request credentials', () => {
    it('keeps the Authorization header captured when the request starts', async () => {
      let resolveResponse!: (response: Response) => void;
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      );

      const request = apiClient.getFields('project-id');

      authStoreMock.state.servers[0]!.token = 'rotated-token';
      authStoreMock.state.token = 'rotated-token';

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://active.example.com/projects/project-id/field',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer active-token',
          }),
        }),
      );

      resolveResponse(
        makeFetchResponse(404, {
          message: 'Route GET:/projects/project-id/field not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      );
      await expect(request).resolves.toEqual({ data: [] });
    });
  });

  describe('getAttachmentUrl', () => {
    it('uses the selected active server URL instead of stale compatibility state', () => {
      authStoreMock.state.baseUrl = 'https://stale.example.com';
      authStoreMock.state.servers[0]!.baseUrl = 'https://selected.example.com/';

      expect(getAttachmentUrl('project', 'drive', 'photo', 'image.jpg')).toBe(
        'https://selected.example.com/projects/project/attachments/drive/photo/image.jpg',
      );
    });
  });
});
