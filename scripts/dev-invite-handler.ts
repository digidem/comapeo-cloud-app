/**
 * Dev-mode handler for invite endpoints (/api/invites/encrypt, /api/invites/decrypt).
 *
 * In production these are Cloudflare Pages Functions that get the INVITE_KEY
 * from `env.INVITE_KEY`. In Vite dev mode we read it from process.env or a
 * .dev.vars file instead.
 *
 * This file is loaded via Vite's SSR transform so it respects the @/ alias.
 */
import * as v from 'valibot';

import type { EncryptedInvitePayload } from '@/lib/invite-crypto';
import { decryptInvite, encryptInvite } from '@/lib/invite-crypto';
import {
  decodeBase64Key,
  formatIssues,
  jsonError,
  withNoStore,
} from '@/lib/pages-fn-utils';
import {
  decryptInviteRequestSchema,
  encryptInviteRequestSchema,
} from '@/lib/schemas/invite';

function getInviteKey(): Uint8Array | null {
  // Try process.env first (set via .dev.vars with Vite dotenv)
  const rawKeyEncoded = process.env.INVITE_KEY;
  if (!rawKeyEncoded || rawKeyEncoded.length === 0) return null;
  const rawKey = decodeBase64Key(rawKeyEncoded);
  if (!rawKey || rawKey.byteLength !== 32) return null;
  return rawKey;
}

export async function handleDevEncrypt(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'INVITE_BAD_JSON', 'Request body must be JSON');
    }

    const parsed = v.safeParse(encryptInviteRequestSchema, body);
    if (!parsed.success) {
      return jsonError(400, 'INVITE_BAD_INPUT', formatIssues(parsed.issues));
    }

    const rawKey = getInviteKey();
    if (!rawKey) {
      return jsonError(
        500,
        'INVITE_KEY_MISSING',
        'Server is missing invite encryption key. Set INVITE_KEY in .dev.vars',
      );
    }

    const { url, token, ttlHours } = parsed.output;
    const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    const code = await encryptInvite({ url, token, exp }, rawKey);

    return withNoStore(Response.json({ code }));
  } catch {
    return jsonError(500, 'INVITE_ENCRYPT_FAILED', 'Failed to encrypt invite');
  }
}

export async function handleDevDecrypt(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'INVITE_BAD_JSON', 'Request body must be JSON');
    }

    const parsed = v.safeParse(decryptInviteRequestSchema, body);
    if (!parsed.success) {
      return jsonError(400, 'INVITE_BAD_INPUT', formatIssues(parsed.issues));
    }

    const rawKey = getInviteKey();
    if (!rawKey) {
      return jsonError(
        500,
        'INVITE_KEY_MISSING',
        'Server is missing invite encryption key. Set INVITE_KEY in .dev.vars',
      );
    }

    const result = await decryptInvite(parsed.output.code, rawKey);
    if (!result.ok) {
      if (result.code === 'INVITE_EXPIRED') {
        return jsonError(
          410,
          'INVITE_EXPIRED',
          'This invite has expired. Ask the sender for a new one.',
        );
      }
      return jsonError(400, result.code, 'Invite code is invalid');
    }

    return withNoStore(
      Response.json({ url: result.value.url, token: result.value.token }),
    );
  } catch {
    return jsonError(500, 'INVITE_DECRYPT_FAILED', 'Failed to decrypt invite');
  }
}
