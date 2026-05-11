import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ALERTS_PATH,
  ApiError,
  apiClient,
  getAttachmentUrl,
  resolveApiRequest,
} from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

const BASE_URL = 'http://localhost:3000';

beforeEach(() => {
  useAuthStore.setState({
    token: 'test-token',
    baseUrl: BASE_URL,
    isAuthenticated: true,
  });
});

afterEach(() => {
  useAuthStore.setState({
    token: null,
    baseUrl: null,
    isAuthenticated: false,
  });
});

// ---------------------------------------------------------------------------
// getServerInfo
// ---------------------------------------------------------------------------
describe('getServerInfo', () => {
  it('returns validated server info on success', async () => {
    const result = await apiClient.getServerInfo();
    expect(result).toEqual({
      data: { deviceId: 'test-device-id', name: 'Test Server' },
    });
  });

  it('does not send auth header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${BASE_URL}/info`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({
          data: { deviceId: 'abc', name: 'S' },
        });
      }),
    );
    await apiClient.getServerInfo();
    expect(capturedAuth).toBeNull();
  });

  it('throws ApiError on error response', async () => {
    server.use(
      http.get(`${BASE_URL}/info`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Something broke' } },
          { status: 500 },
        ),
      ),
    );
    await expect(apiClient.getServerInfo()).rejects.toThrow(ApiError);
    try {
      await apiClient.getServerInfo();
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.code).toBe('INTERNAL_ERROR');
      expect(apiErr.message).toBe('Something broke');
    }
  });

  it('throws on network failure', async () => {
    server.use(http.get(`${BASE_URL}/info`, () => HttpResponse.error()));
    await expect(apiClient.getServerInfo()).rejects.toThrow(
      'Unable to connect',
    );
  });
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------
describe('healthCheck', () => {
  it('returns true on 200', async () => {
    const result = await apiClient.healthCheck();
    expect(result).toBe(true);
  });

  it('returns false on non-200', async () => {
    server.use(
      http.get(`${BASE_URL}/healthcheck`, () =>
        HttpResponse.json(
          { error: { code: 'UNAVAILABLE', message: 'Down' } },
          { status: 503 },
        ),
      ),
    );
    const result = await apiClient.healthCheck();
    expect(result).toBe(false);
  });

  it('returns false on network failure', async () => {
    server.use(http.get(`${BASE_URL}/healthcheck`, () => HttpResponse.error()));
    const result = await apiClient.healthCheck();
    expect(result).toBe(false);
  });

  it('does not send auth header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${BASE_URL}/healthcheck`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await apiClient.healthCheck();
    expect(capturedAuth).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getProjects
// ---------------------------------------------------------------------------
describe('getProjects', () => {
  it('returns validated projects list', async () => {
    const result = await apiClient.getProjects();
    expect(result.data).toBeInstanceOf(Array);
    expect(result.data[0]).toHaveProperty('projectId');
  });

  it('sends Authorization header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${BASE_URL}/projects`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({
          data: [{ projectId: 'p1' }],
        });
      }),
    );
    await apiClient.getProjects();
    expect(capturedAuth).toBe('Bearer test-token');
  });

  it('throws ApiError on error response', async () => {
    server.use(
      http.get(`${BASE_URL}/projects`, () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'No access' } },
          { status: 403 },
        ),
      ),
    );
    await expect(apiClient.getProjects()).rejects.toThrow(ApiError);
  });

  it('throws on network failure', async () => {
    server.use(http.get(`${BASE_URL}/projects`, () => HttpResponse.error()));
    await expect(apiClient.getProjects()).rejects.toThrow('Unable to connect');
  });
});

// ---------------------------------------------------------------------------
// getObservations
// ---------------------------------------------------------------------------
describe('getObservations', () => {
  const projectId = 'proj-obs-1';

  it('returns validated observations', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/observations`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'obs-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              attachments: [],
              tags: {},
            },
          ],
        }),
      ),
    );
    const result = await apiClient.getObservations(projectId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.docId).toBe('obs-1');
  });

  it('sends Authorization header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(
        `${BASE_URL}/projects/${projectId}/observations`,
        ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({ data: [] });
        },
      ),
    );
    await apiClient.getObservations(projectId);
    expect(capturedAuth).toBe('Bearer test-token');
  });

  it('throws ApiError on error response', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/observations`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'No project' } },
          { status: 404 },
        ),
      ),
    );
    await expect(apiClient.getObservations(projectId)).rejects.toThrow(
      ApiError,
    );
  });

  it('throws on network failure', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/observations`, () =>
        HttpResponse.error(),
      ),
    );
    await expect(apiClient.getObservations(projectId)).rejects.toThrow(
      'Unable to connect',
    );
  });
});

// ---------------------------------------------------------------------------
// ALERTS_PATH constant
// ---------------------------------------------------------------------------
describe('ALERTS_PATH constant', () => {
  it('matches the canonical comapeo-cloud server route', () => {
    // The comapeo-cloud server uses /remoteDetectionAlerts, not /alerts.
    // This test ensures the constant stays in sync with the server.
    expect(ALERTS_PATH).toBe('/remoteDetectionAlerts');
  });
});

// ---------------------------------------------------------------------------
// getAlerts
// ---------------------------------------------------------------------------
describe('getAlerts', () => {
  const projectId = 'proj-alert-1';

  it('returns validated alerts', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`, () =>
        HttpResponse.json({
          data: [
            {
              docId: 'alert-1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deleted: false,
              geometry: { type: 'Point', coordinates: [0, 0] },
            },
          ],
        }),
      ),
    );
    const result = await apiClient.getAlerts(projectId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.docId).toBe('alert-1');
  });

  it('sends Authorization header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(
        `${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`,
        ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({ data: [] });
        },
      ),
    );
    await apiClient.getAlerts(projectId);
    expect(capturedAuth).toBe('Bearer test-token');
  });

  it('throws ApiError on error response', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`, () =>
        HttpResponse.json(
          { error: { code: 'SERVER_ERROR', message: 'Oops' } },
          { status: 500 },
        ),
      ),
    );
    await expect(apiClient.getAlerts(projectId)).rejects.toThrow(ApiError);
  });

  it('throws on network failure', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`, () =>
        HttpResponse.error(),
      ),
    );
    await expect(apiClient.getAlerts(projectId)).rejects.toThrow(
      'Unable to connect',
    );
  });
});

// ---------------------------------------------------------------------------
// createAlert
// ---------------------------------------------------------------------------
describe('createAlert', () => {
  const projectId = 'proj-create-alert';
  const body = {
    geometry: { type: 'Point', coordinates: [1.0, 2.0] },
  };

  it('returns successfully on 201', async () => {
    server.use(
      http.post(
        `${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`,
        () => new HttpResponse(null, { status: 201 }),
      ),
    );
    const result = await apiClient.createAlert(projectId, body);
    expect(result.success).toBe(true);
  });

  it('sends Authorization header and request body', async () => {
    let capturedAuth: string | null = null;
    let capturedBody: unknown = null;
    server.use(
      http.post(
        `${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`,
        async ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 201 });
        },
      ),
    );
    await apiClient.createAlert(projectId, body);
    expect(capturedAuth).toBe('Bearer test-token');
    expect(capturedBody).toEqual(body);
  });

  it('throws ApiError on non-201 error', async () => {
    server.use(
      http.post(`${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`, () =>
        HttpResponse.json(
          { error: { code: 'BAD_REQUEST', message: 'Invalid' } },
          { status: 400 },
        ),
      ),
    );
    await expect(apiClient.createAlert(projectId, body)).rejects.toThrow(
      ApiError,
    );
  });

  it('throws on network failure', async () => {
    server.use(
      http.post(`${BASE_URL}/projects/${projectId}/remoteDetectionAlerts`, () =>
        HttpResponse.error(),
      ),
    );
    await expect(apiClient.createAlert(projectId, body)).rejects.toThrow(
      'Unable to connect',
    );
  });
});

// ---------------------------------------------------------------------------
// 401 interceptor
// ---------------------------------------------------------------------------
describe('401 interceptor', () => {
  it('clears auth store on 401 from authenticated endpoint', async () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('test-token');

    server.use(
      http.get(`${BASE_URL}/projects`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
          { status: 401 },
        ),
      ),
    );

    await expect(apiClient.getProjects()).rejects.toThrow(ApiError);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('clears auth store on 401 from any authenticated endpoint', async () => {
    server.use(
      http.get(`${BASE_URL}/projects/proj-x/observations`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Nope' } },
          { status: 401 },
        ),
      ),
    );

    await expect(apiClient.getObservations('proj-x')).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Base URL from auth store
// ---------------------------------------------------------------------------
describe('base URL from auth store', () => {
  it('uses baseUrl from auth store', async () => {
    const customUrl = 'https://custom-server.example.com';
    useAuthStore.setState({ baseUrl: customUrl });

    let capturedUrl: string | null = null;
    server.use(
      http.get(`${customUrl}/info`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          data: { deviceId: 'x', name: 'y' },
        });
      }),
    );

    await apiClient.getServerInfo();
    expect(capturedUrl).toContain('custom-server.example.com/info');
  });

  it('falls back to window.location.origin when baseUrl is null', async () => {
    useAuthStore.setState({ baseUrl: null });

    let requestReachedHandler = false;
    server.use(
      http.get('http://localhost:3000/info', () => {
        requestReachedHandler = true;
        return HttpResponse.json({
          data: { deviceId: 'x', name: 'y' },
        });
      }),
    );

    const result = await apiClient.getServerInfo();
    expect(result.data).toBeDefined();
    expect(requestReachedHandler).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Explicit RequestConfig
// ---------------------------------------------------------------------------

describe('explicit RequestConfig', () => {
  const archiveUrl = 'https://archive.example.com';
  const archiveToken = 'archive-token';

  it('uses baseUrl from RequestConfig for getProjects', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get(`${archiveUrl}/projects`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          data: [{ projectId: 'archive-proj-1' }],
        });
      }),
    );

    const result = await apiClient.getProjects({
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(capturedUrl).toContain(archiveUrl);
    expect(result.data).toHaveLength(1);
  });

  it('sends bearer auth from RequestConfig', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${archiveUrl}/projects`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ data: [] });
      }),
    );

    await apiClient.getProjects({
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(capturedAuth).toBe(`Bearer ${archiveToken}`);
  });

  it('RequestConfig overrides auth store values', async () => {
    // Auth store has different credentials
    useAuthStore.setState({
      token: 'wrong-token',
      baseUrl: 'https://wrong.com',
    });
    let capturedAuth: string | null = null;

    server.use(
      http.get(`${archiveUrl}/projects`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ data: [] });
      }),
    );

    await apiClient.getProjects({
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(capturedAuth).toBe(`Bearer ${archiveToken}`);
  });

  it('explicit RequestConfig works with getObservations', async () => {
    const projectId = 'archive-proj';
    server.use(
      http.get(`${archiveUrl}/projects/${projectId}/observations`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const result = await apiClient.getObservations(projectId, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.data).toEqual([]);
  });

  it('explicit RequestConfig works with getAlerts', async () => {
    const projectId = 'archive-proj';
    server.use(
      http.get(
        `${archiveUrl}/projects/${projectId}/remoteDetectionAlerts`,
        () => HttpResponse.json({ data: [] }),
      ),
    );

    const result = await apiClient.getAlerts(projectId, {
      baseUrl: archiveUrl,
      token: archiveToken,
    });

    expect(result.data).toEqual([]);
  });

  it('explicit RequestConfig works with createAlert', async () => {
    const projectId = 'archive-proj';
    server.use(
      http.post(
        `${archiveUrl}/projects/${projectId}/remoteDetectionAlerts`,
        () => new HttpResponse(null, { status: 201 }),
      ),
    );

    const result = await apiClient.createAlert(
      projectId,
      { geometry: { type: 'Point', coordinates: [0, 0] } },
      { baseUrl: archiveUrl, token: archiveToken },
    );

    expect(result.success).toBe(true);
  });

  it('does NOT clear auth store on 401 with RequestConfig', async () => {
    // Auth store has a valid session
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('test-token');

    server.use(
      http.get(`${archiveUrl}/projects`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
          { status: 401 },
        ),
      ),
    );

    // Call with explicit RequestConfig — should NOT clear auth
    await expect(
      apiClient.getProjects({ baseUrl: archiveUrl, token: archiveToken }),
    ).rejects.toThrow(ApiError);

    // Auth store should remain intact
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('test-token');
  });

  it('routes explicit archive calls through /api outside Vitest', () => {
    const resolved = resolveApiRequest(
      { baseUrl: 'https://archive.example.com/', token: archiveToken },
      { VITEST: false },
    );

    expect(resolved.baseUrl).toBe('/api');
    expect(resolved.extraHeaders).toEqual({
      'x-target-url': 'https://archive.example.com',
    });
  });

  it('keeps direct archive URLs in Vitest so MSW tests stay simple', () => {
    const resolved = resolveApiRequest(
      { baseUrl: archiveUrl, token: archiveToken },
      { VITEST: true },
    );

    expect(resolved.baseUrl).toBe(archiveUrl);
    expect(resolved.extraHeaders).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getAttachmentUrl
// ---------------------------------------------------------------------------
describe('getAttachmentUrl', () => {
  it('builds correct URL without variant', () => {
    const url = getAttachmentUrl('proj-1', 'drive-abc', 'photo', 'image.jpg');
    expect(url).toBe(
      `${BASE_URL}/projects/proj-1/attachments/drive-abc/photo/image.jpg`,
    );
  });

  it('builds correct URL with variant', () => {
    const url = getAttachmentUrl(
      'proj-1',
      'drive-abc',
      'photo',
      'image.jpg',
      'thumbnail',
    );
    expect(url).toBe(
      `${BASE_URL}/projects/proj-1/attachments/drive-abc/photo/image.jpg/thumbnail`,
    );
  });

  it('uses baseUrl from auth store', () => {
    useAuthStore.setState({ baseUrl: 'https://other.example.com' });
    const url = getAttachmentUrl('proj-1', 'drive-abc', 'photo', 'img.png');
    expect(url).toBe(
      'https://other.example.com/projects/proj-1/attachments/drive-abc/photo/img.png',
    );
  });
});
