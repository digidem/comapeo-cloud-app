import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseInviteUrl } from '@/lib/invite-url';

describe('parseInviteUrl', () => {
  it('parses a valid invite URL with hash param', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'legacy',
      baseUrl: 'https://archive.test',
      token: 'abc',
    });
  });

  it('uses explicit token param when present', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?hash=fingerprint&url=https%3A%2F%2Farchive.test&token=real-token',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'legacy',
      baseUrl: 'https://archive.test',
      token: 'real-token',
    });
  });

  it('returns error when url param is missing', () => {
    const result = parseInviteUrl('https://app.com/invite?hash=abc');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_URL');
    }
  });

  it('returns error when both token and hash are missing', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?url=https%3A%2F%2Farchive.test',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_TOKEN');
    }
  });

  it('returns error when path is not /invite', () => {
    const result = parseInviteUrl(
      'https://app.com/other?hash=abc&url=https%3A%2F%2Farchive.test',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_PATH');
    }
  });

  it('returns error for invalid URL', () => {
    const result = parseInviteUrl('not-a-url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_URL');
    }
  });

  it('decodes URL-encoded archive URL correctly', () => {
    const result = parseInviteUrl(
      'https://app.example.com/invite?hash=abc123&url=https%3A%2F%2Farchive.example.com%3A8080%2Fpath',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'legacy',
      baseUrl: 'https://archive.example.com:8080/path',
      token: 'abc123',
    });
  });

  it('parses encrypted invite URL with code param', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?code=Y29kZQ&url=https%3A%2F%2Farchive.test',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'encrypted',
      code: 'Y29kZQ',
    });
  });

  it('prefers code param over legacy params when both present', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?code=Y29kZQ&token=raw-token&url=https%3A%2F%2Farchive.test',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'encrypted',
      code: 'Y29kZQ',
    });
  });

  it('falls back to legacy when code param is empty', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?code=&hash=abc&url=https%3A%2F%2Farchive.test',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'legacy',
      baseUrl: 'https://archive.test',
      token: 'abc',
    });
  });

  it('preserves URL-encoded characters in code param', () => {
    const result = parseInviteUrl(
      'https://app.com/invite?code=abc%2Bdef%3D%3D',
    );
    expect(result).toEqual({
      ok: true,
      kind: 'encrypted',
      code: 'abc+def==',
    });
  });
});

// `warnLegacyInviteUrlOnce` has a module-level guard so it fires at most
// once per session. Each test re-imports the module via `vi.resetModules`
// + dynamic import so the guard starts fresh.
describe('warnLegacyInviteUrlOnce (isolated)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('emits a deprecation warning the first time it is called', async () => {
    const { warnLegacyInviteUrlOnce } = await import('@/lib/invite-url');
    warnLegacyInviteUrlOnce();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(message).toMatch(/deprecated/i);
  });

  it('does not log a token, code, or URL in the warning text', async () => {
    const { warnLegacyInviteUrlOnce } = await import('@/lib/invite-url');
    warnLegacyInviteUrlOnce();
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toMatch(/token=/);
  });

  it('only emits the warning once across multiple calls in the same module instance', async () => {
    const { warnLegacyInviteUrlOnce } = await import('@/lib/invite-url');
    warnLegacyInviteUrlOnce();
    warnLegacyInviteUrlOnce();
    warnLegacyInviteUrlOnce();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
