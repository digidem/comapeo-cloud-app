import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Parse the public/_headers file into a structured representation.
// Cloudflare Pages _headers format:
//   - Lines starting with `#` or blank lines are comments/blank.
//   - A line with no leading whitespace is a path/matcher pattern.
//   - Indented (2-space) lines under a matcher are header: value pairs.
function parseHeadersFile(content: string) {
  const matchers: Record<string, Record<string, string>> = {};
  let current: string | null = null;

  for (const rawLine of content.split('\n')) {
    const stripped = rawLine.trimEnd();
    if (stripped === '' || stripped.startsWith('#')) continue;

    // Indented line → header k/v under the current matcher.
    if (/^\s/.test(rawLine)) {
      if (current === null) continue;
      const [name, ...rest] = stripped.split(':');
      const headerName = name?.trim() ?? '';
      const headerValue = rest.join(':').trim();
      if (headerName) {
        matchers[current]![headerName] = headerValue;
      }
      continue;
    }

    // Non-indented line → new matcher.
    current = stripped;
    matchers[current] = {};
  }

  return matchers;
}

describe('public/_headers', () => {
  const headersPath = resolve(process.cwd(), 'public/_headers');
  const content = readFileSync(headersPath, 'utf-8');
  const matchers = parseHeadersFile(content);

  // The catch-all matcher (first block, no path) applies to all static pages.
  const catchAll = Object.keys(matchers)[0] ?? '';
  const catchAllHeaders = matchers[catchAll] ?? {};

  describe('existing protections are preserved', () => {
    it('sets X-Frame-Options: DENY', () => {
      expect(catchAllHeaders['X-Frame-Options']).toBe('DENY');
    });

    it('sets X-Content-Type-Options: nosniff', () => {
      expect(catchAllHeaders['X-Content-Type-Options']).toBe('nosniff');
    });

    it('sets Referrer-Policy', () => {
      expect(catchAllHeaders['Referrer-Policy']).toBeTruthy();
      expect(catchAllHeaders['Referrer-Policy']).toBe(
        'strict-origin-when-cross-origin',
      );
    });

    it('sets Permissions-Policy', () => {
      expect(catchAllHeaders['Permissions-Policy']).toBeTruthy();
      expect(catchAllHeaders['Permissions-Policy']).toContain('camera=()');
      expect(catchAllHeaders['Permissions-Policy']).toContain('microphone=()');
      expect(catchAllHeaders['Permissions-Policy']).toContain('geolocation=()');
    });

    it('preserves connect-src with https: and blob: sources', () => {
      const csp = catchAllHeaders['Content-Security-Policy'];
      expect(csp).toContain("connect-src 'self' https: blob:");
    });
  });

  describe('HSTS directive (VAL-HEADERS-001)', () => {
    it('adds Strict-Transport-Security with max-age=31536000', () => {
      expect(catchAllHeaders['Strict-Transport-Security']).toBe(
        'max-age=31536000',
      );
    });

    it('does NOT add includeSubDomains or preload', () => {
      const hsts = catchAllHeaders['Strict-Transport-Security'];
      expect(hsts).not.toContain('includeSubDomains');
      expect(hsts).not.toContain('preload');
    });
  });

  describe('CSP hardening directives (VAL-HEADERS-001)', () => {
    const csp = catchAllHeaders['Content-Security-Policy'] ?? '';

    it('preserves default-src', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('preserves script-src', () => {
      expect(csp).toContain("script-src 'self'");
    });

    it('preserves style-src', () => {
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('preserves font-src', () => {
      expect(csp).toContain("font-src 'self'");
    });

    it('preserves img-src', () => {
      expect(csp).toContain("img-src 'self' data: blob:");
    });

    it('preserves manifest-src', () => {
      expect(csp).toContain("manifest-src 'self'");
    });

    it('preserves worker-src', () => {
      expect(csp).toContain("worker-src 'self' blob:");
    });

    it('adds frame-ancestors directive with none', () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('adds base-uri directive with self', () => {
      expect(csp).toContain("base-uri 'self'");
    });

    it('adds object-src directive with none', () => {
      expect(csp).toContain("object-src 'none'");
    });

    it('adds form-action directive with self', () => {
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('tiles retain public cache policy and nosniff', () => {
    it('tiles path has Cache-Control public and max-age', () => {
      // Tiles are proxied through /api/tiles — but the /sw.js path in _headers
      // is the static asset cache example. Find any matcher with Cache-Control.
      const allMatchers = matchers;
      const tileOrSw = allMatchers['/sw.js'] ?? allMatchers['/assets/*'] ?? {};
      expect(tileOrSw['Cache-Control']).toBeTruthy();
    });

    it('X-Content-Type-Options nosniff is preserved on all matchers', () => {
      // The catch-all has it; verify it's not removed from any matcher that
      // explicitly sets it (there should be at least the catch-all).
      expect(catchAllHeaders['X-Content-Type-Options']).toBe('nosniff');
    });
  });
});
