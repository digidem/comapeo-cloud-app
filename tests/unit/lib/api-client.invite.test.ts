import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  InviteApiError,
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
    server.use(
      http.post('*/api/invites/encrypt', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ code: 'mock-encrypted-code-xyz' });
      }),
    );

    await createEncryptedInvite('https://archive.example', 'tok-abc', 1);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.ttlHours).toBe(1);
    expect(capturedBody!.url).toBe('https://archive.example');
    expect(capturedBody!.token).toBe('tok-abc');
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
});
