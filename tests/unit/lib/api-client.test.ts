import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from '@/lib/api-client';

// Mock the stores used by api-client internals
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ baseUrl: null, token: null })),
  },
}));

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getPresets — 304 handling', () => {
    it('returns empty data when server responds 304 Not Modified', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 304 }));

      const result = await apiClient.getPresets('base32proj1');
      expect(result).toEqual({ data: [] });
    });

    it('still throws ApiError for real 4xx/5xx errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Project not found' },
          }),
          { status: 404 },
        ),
      );

      // getPresets catches 404 and returns { data: [] }, not throws
      const result = await apiClient.getPresets('badproj');
      expect(result).toEqual({ data: [] });
    });

    it('throws ApiError for a non-304 non-404 error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'SERVER_ERROR', message: 'Boom' },
          }),
          { status: 500 },
        ),
      );

      await expect(apiClient.getPresets('base32proj1')).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe('getFields — 304 handling', () => {
    it('returns empty data when server responds 304 Not Modified', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 304 }));

      const result = await apiClient.getFields('base32proj1');
      expect(result).toEqual({ data: [] });
    });

    it('returns empty data for 404 (legacy server)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Not found' },
          }),
          { status: 404 },
        ),
      );

      const result = await apiClient.getFields('badproj');
      expect(result).toEqual({ data: [] });
    });
  });

  describe('getPresets — success path', () => {
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
        .mockResolvedValue(
          new Response(JSON.stringify(presetsPayload), { status: 200 }),
        );

      const result = await apiClient.getPresets('base32proj1');
      expect(result).toEqual(presetsPayload);
    });
  });
});
