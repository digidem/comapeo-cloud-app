import * as v from 'valibot';

import { decryptInvite } from '../../../src/lib/invite-crypto';
import {
  decodeBase64Key,
  formatIssues,
  jsonError,
  withNoStore,
} from '../../../src/lib/pages-fn-utils';
import { decryptInviteRequestSchema } from '../../../src/lib/schemas/invite';

interface Env {
  INVITE_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

export async function onRequestPost({
  request,
  env,
}: PagesContext): Promise<Response> {
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

    const rawKeyEncoded = env.INVITE_KEY;
    if (!rawKeyEncoded || rawKeyEncoded.length === 0) {
      return jsonError(
        500,
        'INVITE_KEY_MISSING',
        'Server is missing invite encryption key',
      );
    }

    const rawKey = decodeBase64Key(rawKeyEncoded);
    if (!rawKey || rawKey.byteLength !== 32) {
      return jsonError(
        500,
        'INVITE_KEY_INVALID',
        'Server invite key is malformed',
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
      // INVITE_BAD_FORMAT | INVITE_BAD_VERSION | INVITE_DECRYPT_FAILED
      // Keep structured `code` for diagnostics; use generic client message.
      return jsonError(400, result.code, 'Invite code is invalid');
    }

    return withNoStore(
      Response.json({ url: result.value.url, token: result.value.token }),
    );
  } catch {
    return jsonError(500, 'INVITE_DECRYPT_FAILED', 'Failed to decrypt invite');
  }
}

export async function onRequest({
  request,
}: {
  request: Request;
}): Promise<Response> {
  return jsonError(
    405,
    'METHOD_NOT_ALLOWED',
    `Method ${request.method} not allowed`,
  );
}
