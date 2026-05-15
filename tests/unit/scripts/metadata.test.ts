import { describe, expect, it } from 'vitest';

import {
  MetadataError,
  generateRobotsTxt,
  generateSitemapXml,
  validateOrigin,
} from '../../../scripts/lib/metadata';

describe('validateOrigin', () => {
  it('returns a valid HTTPS origin', () => {
    expect(validateOrigin('https://example.com')).toBe('https://example.com');
  });

  it('throws for empty string', () => {
    expect(() => validateOrigin('')).toThrow(MetadataError);
  });

  it('throws for non-HTTPS origin', () => {
    expect(() => validateOrigin('http://insecure.com')).toThrow(MetadataError);
  });

  it('throws for origin with trailing slash', () => {
    expect(() => validateOrigin('https://example.com/')).toThrow(MetadataError);
  });

  it('throws for origin with a path', () => {
    expect(() => validateOrigin('https://example.com/path')).toThrow(
      MetadataError,
    );
  });

  it('throws for invalid URL', () => {
    expect(() => validateOrigin('not-a-url')).toThrow(MetadataError);
  });
});

describe('generateRobotsTxt', () => {
  it('includes the sitemap URL', () => {
    const result = generateRobotsTxt('https://example.com');
    expect(result).toContain('User-agent: *');
    expect(result).toContain('Allow: /');
    expect(result).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});

describe('generateSitemapXml', () => {
  it('includes the origin URL', () => {
    const result = generateSitemapXml('https://example.com');
    expect(result).toContain('<?xml version="1.0"');
    expect(result).toContain('<loc>https://example.com/</loc>');
    expect(result).toContain('<priority>1.0</priority>');
  });
});
