import { describe, expect, it, vi } from 'vitest';

import { uuid } from '@/lib/uuid';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid', () => {
  it('returns a valid RFC 4122 v4 UUID string', () => {
    const id = uuid();
    expect(id).toMatch(UUID_V4_RE);
  });

  it('generates unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (crypto as any).randomUUID;

    const id = uuid();
    expect(id).toMatch(UUID_V4_RE);

    // Restore
    crypto.randomUUID = original;
  });

  it('works when crypto object has no randomUUID at all', () => {
    const originalRandomUUID = crypto.randomUUID;
    const originalGetRandomValues = crypto.getRandomValues;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (crypto as any).randomUUID;

    const id = uuid();
    expect(id).toMatch(UUID_V4_RE);

    // Restore
    crypto.randomUUID = originalRandomUUID;
    crypto.getRandomValues = originalGetRandomValues;
  });

  it('uses crypto.randomUUID when available', () => {
    const spy = vi.spyOn(crypto, 'randomUUID');
    uuid();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
