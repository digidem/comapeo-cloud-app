/**
 * Generate a UUID v4 string.
 *
 * Uses `crypto.randomUUID()` when available (secure contexts / HTTPS).
 * Falls back to a `crypto.getRandomValues()`-based implementation for
 * non-secure contexts (e.g. plain HTTP on mobile devices).
 */
export function uuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return uuidFromRandomValues();
}

function uuidFromRandomValues(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant (RFC 4122)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 24),
    hex.slice(24, 32),
  ].join('-');
}
