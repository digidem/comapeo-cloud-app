# First-party invite API

This document is the canonical application-owned contract for the Cloudflare Pages invite endpoints. These routes are not part of the remote `comapeo-cloud` API documented in `remote-archive-api-spec.md`.

Both routes are first-party Pages Functions, return no-store responses, and require the server-side invite encryption key described in `AGENTS.md#cloudflare-deployment`. Clients must not send the archive bearer credential as HTTP authorization to these endpoints; the credential is encrypted inside the invite payload.

## `POST /api/invites/encrypt`

Creates an encrypted invite code.

Request fields:

- `url`: required, non-empty valid URL.
- `token`: required, non-empty archive credential string.
- `ttlHours`: optional number from 1 through 168; defaults to 24.

Success response (`200`) is a JSON object with one `code` string field.

Relevant failures:

- `400 INVITE_BAD_JSON` — request body is not JSON.
- `400 INVITE_BAD_INPUT` — request does not satisfy the schema.
- `500 INVITE_KEY_MISSING` or `INVITE_KEY_INVALID` — server invite key is absent or malformed.
- `500 INVITE_ENCRYPT_FAILED` — encryption failed unexpectedly.
- non-POST methods return `405 METHOD_NOT_ALLOWED`.

## `POST /api/invites/decrypt`

Decrypts a still-valid invite code.

Request fields:

- `code`: required, non-empty string, maximum 2048 characters.

Success response (`200`) is a JSON object with `url` and `token` string fields.

Relevant failures:

- `400 INVITE_BAD_JSON` — request body is not JSON.
- `400 INVITE_BAD_INPUT` — request does not satisfy the schema.
- `400` with the structured invite error code — code is malformed, unsupported, or cannot be decrypted; client message remains generic.
- `410 INVITE_EXPIRED` — invite expiry timestamp has passed; the user must obtain a new invite.
- `500 INVITE_KEY_MISSING` or `INVITE_KEY_INVALID` — server invite key is absent or malformed.
- `500 INVITE_DECRYPT_FAILED` — decryption failed unexpectedly.
- non-POST methods return `405 METHOD_NOT_ALLOWED`.

## Implementation sources

The normative executable sources are:

- `src/lib/schemas/invite.ts` for request validation and TTL/code bounds;
- `functions/api/invites/encrypt.ts` and `functions/api/invites/decrypt.ts` for HTTP behavior;
- `src/lib/invite-crypto.ts` for the encrypted payload/version contract;
- `tests/unit/lib/api-client.invite.test.ts` and function tests for regression coverage.

If this document and executable behavior diverge, update the document in the same change that intentionally changes the API contract.
