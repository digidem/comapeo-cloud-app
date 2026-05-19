import * as v from 'valibot';

export const encryptInviteRequestSchema = v.object({
  url: v.pipe(v.string(), v.nonEmpty(), v.url()),
  token: v.pipe(v.string(), v.nonEmpty()),
  ttlHours: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(168)), 24),
});

export const decryptInviteRequestSchema = v.object({
  // Real ciphertexts are ~160 base64url chars; cap defensively so the server
  // rejects oversized payloads before allocating buffers for AES-GCM decrypt.
  code: v.pipe(v.string(), v.nonEmpty(), v.maxLength(2048)),
});

export type EncryptInviteRequest = v.InferOutput<
  typeof encryptInviteRequestSchema
>;
export type DecryptInviteRequest = v.InferOutput<
  typeof decryptInviteRequestSchema
>;
