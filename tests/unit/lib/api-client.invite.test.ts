import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  ApiError,
  InviteApiError,
  NetworkError,
  apiClient,
  createEncryptedInvite,
  redeemEncryptedInvite,
} from '@/lib/api-client';

describe('createEncryptedInvite', () => {
  it('resolves with a mock encrypted code', async () => {
    const result = await createEncryptedInvite(
      'https://archive.example',
      'tok-abc',
    );
    expect(result.code).toMatch(/^mock-encrypted-code-/);
  });

  it('throws InviteApiError with INVITE_BAD_INPUT when url is empty', async () => {
    await expect(createEncryptedInvite('', 'tok-abc')).rejects.toMatchObject({
      name: 'InviteApiError',
      code: 'INVITE_BAD_INPUT',
    });
  });

  it('forwards ttlHours in the request body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedAuth: string | null = null;
    server.use(
      http.post('*/api/invites/encrypt', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ code: 'mock-encrypted-code-xyz' });
      }),
    );

    await createEncryptedInvite('https://archive.example', 'tok-abc', 1);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.ttlHours).toBe(1);
    expect(capturedBody!.url).toBe('https://archive.example');
    expect(capturedBody!.token).toBe('tok-abc');
    // Issue #8 regression guard: invite endpoints are first-party; the
    // archive bearer token must never appear on the wire to /api/invites/*.
    expect(capturedAuth).toBeNull();
  });

  it('forwards optional project scope metadata without an Authorization header', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedAuth: string | null = null;
    server.use(
      http.post('*/api/invites/encrypt', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ code: 'mock-encrypted-code-scoped' });
      }),
    );

    await createEncryptedInvite('https://archive.example', 'scoped-token', 24, {
      type: 'project',
      projectId: 'project-a',
    });

    expect(capturedBody).toMatchObject({
      url: 'https://archive.example',
      token: 'scoped-token',
      ttlHours: 24,
      scope: { type: 'project', projectId: 'project-a' },
    });
    expect(capturedAuth).toBeNull();
  });

  it('throws InviteApiError with INVITE_BAD_INPUT when token is empty', async () => {
    await expect(
      createEncryptedInvite('https://archive.example', ''),
    ).rejects.toMatchObject({
      name: 'InviteApiError',
      code: 'INVITE_BAD_INPUT',
    });
  });
});

describe('redeemEncryptedInvite', () => {
  it('round-trips a code produced by createEncryptedInvite', async () => {
    const archiveUrl = 'https://archive.example.com';
    const archiveToken = 'tok-round-trip';

    const { code } = await createEncryptedInvite(archiveUrl, archiveToken);
    const result = await redeemEncryptedInvite(code);

    expect(result).toEqual({ baseUrl: archiveUrl, token: archiveToken });
  });

  it('returns optional project scope metadata from a redeemed invite', async () => {
    server.use(
      http.post('*/api/invites/decrypt', () =>
        HttpResponse.json({
          url: 'https://archive.example',
          token: 'scoped-token',
          scope: { type: 'project', projectId: 'project-a' },
        }),
      ),
    );

    await expect(redeemEncryptedInvite('scoped-code')).resolves.toEqual({
      baseUrl: 'https://archive.example',
      token: 'scoped-token',
      accessScope: { type: 'project', projectId: 'project-a' },
    });
  });

  it('throws InviteApiError with INVITE_EXPIRED for "expired" code', async () => {
    await expect(redeemEncryptedInvite('expired')).rejects.toMatchObject({
      name: 'InviteApiError',
      code: 'INVITE_EXPIRED',
    });
  });

  it('throws InviteApiError with INVITE_DECRYPT_FAILED for "invalid" code', async () => {
    await expect(redeemEncryptedInvite('invalid')).rejects.toMatchObject({
      name: 'InviteApiError',
      code: 'INVITE_DECRYPT_FAILED',
    });
  });

  it('throws InviteApiError that is an instance of the exported class', async () => {
    try {
      await redeemEncryptedInvite('expired');
    } catch (err) {
      expect(err).toBeInstanceOf(InviteApiError);
      return;
    }
    throw new Error('expected redeemEncryptedInvite to throw');
  });

  it('does not send Authorization header to the redeem endpoint', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post('*/api/invites/decrypt', ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({
          url: 'https://archive.example',
          token: 'tok',
        });
      }),
    );

    await redeemEncryptedInvite('mock-encrypted-code-anything');

    // Issue #8 regression guard: redeem is anonymous; sending the archive
    // bearer here would leak it to anyone who can serve /api/invites/decrypt.
    expect(capturedAuth).toBeNull();
  });
});

describe('apiClient.createProjectAccessToken', () => {
  it('POSTs to the project access-token endpoint with archive credentials and validates the response', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post(
        'https://archive.example/projects/project-a/accessTokens',
        ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({
            data: {
              token: 'cpat1.payload.signature',
              projectId: 'project-a',
            },
          });
        },
      ),
    );

    await expect(
      apiClient.createProjectAccessToken('project-a', {
        baseUrl: 'https://archive.example',
        token: 'archive-token',
      }),
    ).resolves.toEqual({
      token: 'cpat1.payload.signature',
      projectId: 'project-a',
    });
    expect(capturedAuth).toBe('Bearer archive-token');
  });

  it('surfaces 501 unsupported server responses without falling back', async () => {
    server.use(
      http.post('https://archive.example/projects/project-a/accessTokens', () =>
        HttpResponse.json(
          {
            error: {
              code: 'PROJECT_ACCESS_TOKENS_UNAVAILABLE',
              message: 'Project access tokens are unavailable',
            },
          },
          { status: 501 },
        ),
      ),
    );

    await expect(
      apiClient.createProjectAccessToken('project-a', {
        baseUrl: 'https://archive.example',
        token: 'archive-token',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 501,
      code: 'PROJECT_ACCESS_TOKENS_UNAVAILABLE',
    } satisfies Partial<ApiError>);
  });

  it('distinguishes forbidden scoped issuers from missing projects and network failures', async () => {
    server.use(
      http.post('https://archive.example/projects/forbidden/accessTokens', () =>
        HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Archive-wide access is required',
            },
          },
          { status: 403 },
        ),
      ),
      http.post('https://archive.example/projects/missing/accessTokens', () =>
        HttpResponse.json(
          {
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: 'Project not found',
            },
          },
          { status: 404 },
        ),
      ),
      http.post('https://archive.example/projects/offline/accessTokens', () =>
        HttpResponse.error(),
      ),
    );

    await expect(
      apiClient.createProjectAccessToken('forbidden', {
        baseUrl: 'https://archive.example',
        token: 'scoped-token',
      }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiError>);
    await expect(
      apiClient.createProjectAccessToken('missing', {
        baseUrl: 'https://archive.example',
        token: 'archive-token',
      }),
    ).rejects.toMatchObject({
      status: 404,
      kind: 'missing-project',
    } satisfies Partial<ApiError>);
    await expect(
      apiClient.createProjectAccessToken('offline', {
        baseUrl: 'https://archive.example',
        token: 'archive-token',
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('rejects a scoped-token response whose projectId does not match the requested project', async () => {
    server.use(
      http.post('https://archive.example/projects/project-a/accessTokens', () =>
        HttpResponse.json({
          data: {
            token: 'cpat1.payload.signature',
            projectId: 'project-b',
          },
        }),
      ),
    );

    await expect(
      apiClient.createProjectAccessToken('project-a', {
        baseUrl: 'https://archive.example',
        token: 'archive-token',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      code: 'PROJECT_ACCESS_TOKEN_PROJECT_MISMATCH',
    } satisfies Partial<ApiError>);
  });
});
