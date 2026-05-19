import * as v from 'valibot';

import { encryptInvite } from '../../../src/lib/invite-crypto';
import {
  decodeBase64Key,
  formatIssues,
  jsonError,
  withNoStore,
} from '../../../src/lib/pages-fn-utils';
import { encryptInviteRequestSchema } from '../../../src/lib/schemas/invite';

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

    const parsed = v.safeParse(encryptInviteRequestSchema, body);
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

    const { url, token, ttlHours } = parsed.output;
    const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    const code = await encryptInvite({ url, token, exp }, rawKey);

    return withNoStore(Response.json({ code }));
  } catch {
    return jsonError(500, 'INVITE_ENCRYPT_FAILED', 'Failed to encrypt invite');
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
