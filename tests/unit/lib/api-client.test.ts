import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  CredentialsRequiredError,
  apiClient,
  getAttachmentUrl,
} from '@/lib/api-client';

type AuthStoreMockServer = {
  id: string;
  label: string;
  baseUrl: string;
  token: string | null;
  status: string;
};

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
    ] as AuthStoreMockServer[],
    baseUrl: 'https://active.example.com' as string | null,
    token: 'active-token' as string | null,
  },
  lockServerCredential: vi.fn(),
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
        lockServerCredential: authStoreMock.lockServerCredential,
      }),
    },
  };
});

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock.lockServerCredential.mockReset();
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

  describe('401 runtime credential locking', () => {
    const error401 = {
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    };
    const error403 = {
      error: { code: 'FORBIDDEN', message: 'Forbidden' },
    };
    const otherConfig = {
      baseUrl: 'https://other.example.com',
      token: 'other-token',
      serverId: 'other-server',
    };

    it('locks the active server identity captured by a 401 without explicit config', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(apiClient.getPresets('project-id')).rejects.toThrow(
        ApiError,
      );

      expect(authStoreMock.lockServerCredential).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://active.example.com',
        token: authStoreMock.state.token,
      });
    });

    it('locks explicit server B rather than whichever server is active', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.getPresets('project-id', otherConfig),
      ).rejects.toThrow(ApiError);

      expect(authStoreMock.lockServerCredential).toHaveBeenCalledWith({
        activeServerId: 'other-server',
        baseUrl: 'https://other.example.com',
        token: 'other-token',
      });
    });

    it('captures a candidate request with null server id so it cannot target an installed archive', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.getPresets('project-id', {
          baseUrl: 'https://candidate.example.com',
          token: 'candidate-token',
          serverId: null,
        }),
      ).rejects.toThrow(ApiError);

      expect(authStoreMock.lockServerCredential).toHaveBeenCalledWith({
        activeServerId: null,
        baseUrl: 'https://candidate.example.com',
        token: 'candidate-token',
      });
    });

    it('keeps the request identity captured before active selection changes', async () => {
      let resolveResponse!: (response: Response) => void;
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      );

      const originalCredential = authStoreMock.state.token;
      const request = apiClient.getPresets('project-id');
      authStoreMock.state.activeServerId = 'server-b';
      authStoreMock.state.servers = [
        {
          id: 'server-b',
          label: 'Server B',
          baseUrl: 'https://server-b.example.com',
          token: String(654321),
          status: 'connected',
        },
      ];
      authStoreMock.state.baseUrl = 'https://server-b.example.com';
      resolveResponse(makeFetchResponse(401, error401));

      await expect(request).rejects.toThrow(ApiError);
      expect(authStoreMock.lockServerCredential).toHaveBeenCalledWith({
        activeServerId: 'active-server',
        baseUrl: 'https://active.example.com',
        token: originalCredential,
      });
    });

    it('uses the same explicit identity for createAlert and getIcon 401s', async () => {
      const alertBody = {
        detectionDateStart: '2025-01-01T00:00:00Z',
        detectionDateEnd: '2025-01-01T23:59:59Z',
        sourceId: 'test-source',
        metadata: {},
        geometry: {
          type: 'Point' as const,
          coordinates: [0, 0] as [number, number],
        },
      };
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      await expect(
        apiClient.createAlert('project-id', alertBody, otherConfig),
      ).rejects.toThrow(ApiError);
      await expect(
        apiClient.getIcon('project-id', 'icon-id', otherConfig),
      ).rejects.toThrow(ApiError);

      expect(authStoreMock.lockServerCredential).toHaveBeenCalledTimes(2);
      expect(authStoreMock.lockServerCredential).toHaveBeenLastCalledWith({
        activeServerId: 'other-server',
        baseUrl: 'https://other.example.com',
        token: 'other-token',
      });
    });

    it('does not lock credentials for 403 or 500 responses', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(makeFetchResponse(403, error403))
        .mockResolvedValueOnce(
          makeFetchResponse(500, {
            error: { code: 'SERVER_ERROR', message: 'Boom' },
          }),
        );

      await expect(apiClient.getPresets('project-id')).rejects.toThrow(
        ApiError,
      );
      await expect(apiClient.getPresets('project-id')).rejects.toThrow(
        ApiError,
      );
      expect(authStoreMock.lockServerCredential).not.toHaveBeenCalled();
    });

    it('still surfaces the original 401 if runtime locking throws', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      authStoreMock.lockServerCredential.mockImplementationOnce(() => {
        throw new Error('runtime lock failed');
      });
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(makeFetchResponse(401, error401));

      const error = await apiClient.getPresets('project-id').then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('locked request short-circuit', () => {
    it('throws credentials-required before fetch when the active archive is locked', async () => {
      authStoreMock.state.servers[0]!.token = null;
      authStoreMock.state.token = null;
      globalThis.fetch = vi.fn();

      await expect(apiClient.getProjects()).rejects.toBeInstanceOf(
        CredentialsRequiredError,
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('throws credentials-required before fetch for an explicit empty credential', async () => {
      globalThis.fetch = vi.fn();

      await expect(
        apiClient.getProjects({
          baseUrl: 'https://locked.example.com',
          token: '',
          serverId: 'locked-server',
        }),
      ).rejects.toMatchObject({
        code: 'credentials-required',
        serverId: 'locked-server',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
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
