import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from '@/lib/api-client';

describe('apiClient reconciliation semantics', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('distinguishes an unsupported route from an empty snapshot', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Route GET:/projects/p1/track not found',
          error: 'Not Found',
          statusCode: 404,
        }),
        { status: 404 },
      ),
    );

    const result = await apiClient.getTracks('p1');

    expect(result.data).toEqual([]);
    expect(result.semantics).toMatchObject({
      availability: 'unsupported',
      mode: 'unknown',
    });
  });

  it('classifies a project-level 404 separately', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        }),
        { status: 404 },
      ),
    );

    await expect(apiClient.getTracks('missing')).rejects.toMatchObject({
      kind: 'missing-project',
    } satisfies Partial<ApiError>);
  });

  it('requires an explicit snapshot declaration for token-scoped projects', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'x-comapeo-api-version': '0.6.0' },
      }),
    );

    const unconfirmed = await apiClient.getProjects();

    expect(unconfirmed.semantics).toMatchObject({
      availability: 'supported',
      mode: 'unknown',
      source: 'contract',
      apiVersion: '0.6.0',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'x-comapeo-reconciliation-mode': 'snapshot' },
      }),
    );

    const confirmed = await apiClient.getProjects();
    expect(confirmed.semantics).toMatchObject({
      mode: 'snapshot',
      source: 'header',
    });
  });

  it('marks a successful empty response as a confirmed snapshot', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

    const result = await apiClient.getFields('p1');

    expect(result.semantics).toMatchObject({
      availability: 'supported',
      mode: 'snapshot',
      source: 'contract',
    });
  });

  it('passes abort signals to downstream fetches', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    globalThis.fetch = fetchMock;

    await apiClient.getObservations('p1', {
      baseUrl: 'https://archive.example.com',
      token: 'token',
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
