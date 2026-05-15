import { describe, expect, it } from 'vitest';

import {
  ARCHIVE_TARGET_HEADER,
  buildArchiveTargetUrl,
  createForwardHeaders,
  normalizeArchiveBaseUrl,
  stripApiPrefix,
  validateArchiveProxyRequest,
} from '@/lib/archive-proxy';

describe('archive proxy helpers', () => {
  it('normalizes HTTP and HTTPS archive base URLs', () => {
    expect(normalizeArchiveBaseUrl('https://archive.example.com/')).toEqual({
      ok: true,
      value: 'https://archive.example.com',
    });
    expect(normalizeArchiveBaseUrl('http://127.0.0.1:8080/base/')).toEqual({
      ok: true,
      value: 'http://127.0.0.1:8080/base',
    });
  });

  it('rejects missing protocol and unsupported protocols', () => {
    expect(normalizeArchiveBaseUrl('archive.example.com')).toEqual({
      ok: false,
      code: 'INVALID_ARCHIVE_URL',
      message: 'Enter a full URL including http:// or https://',
    });
    expect(normalizeArchiveBaseUrl('ftp://archive.example.com')).toEqual({
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROTOCOL',
      message: 'Archive server URL must start with http:// or https://',
    });
    expect(
      normalizeArchiveBaseUrl('https://user:pass@archive.example.com'),
    ).toEqual({
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_URL_CREDENTIALS',
      message: 'Archive server URL must not include credentials',
    });
  });

  it('strips the /api prefix without dropping the upstream path', () => {
    expect(stripApiPrefix('/api/projects')).toBe('/projects');
    expect(stripApiPrefix('/api/projects/proj-1/observations')).toBe(
      '/projects/proj-1/observations',
    );
    expect(stripApiPrefix('/api')).toBe('/');
  });

  it('builds a target URL preserving target base paths and query strings', () => {
    expect(
      buildArchiveTargetUrl(
        'https://app.example.com/api/projects?limit=10',
        'https://archive.example.com/base/',
      ),
    ).toEqual({
      ok: true,
      value: 'https://archive.example.com/base/projects?limit=10',
    });
  });

  it('filters routing and hop-by-hop headers but preserves Authorization', () => {
    const input = new Headers({
      [ARCHIVE_TARGET_HEADER]: 'https://archive.example.com',
      Authorization: 'Bearer token',
      Connection: 'keep-alive',
      Cookie: 'session=secret',
      Host: 'localhost:5173',
      Origin: 'https://app.example.com',
      Referer: 'https://app.example.com/',
      Accept: 'application/json',
    });

    const output = createForwardHeaders(input);

    expect(output.get(ARCHIVE_TARGET_HEADER)).toBeNull();
    expect(output.get('Connection')).toBeNull();
    expect(output.get('Cookie')).toBeNull();
    expect(output.get('Host')).toBeNull();
    expect(output.get('Origin')).toBeNull();
    expect(output.get('Referer')).toBeNull();
    expect(output.get('Authorization')).toBe('Bearer token');
    expect(output.get('Accept')).toBe('application/json');
  });

  it('allows only the archive endpoints used by the client', () => {
    expect(validateArchiveProxyRequest('GET', '/info')).toEqual({
      ok: true,
      value: '/info',
    });
    expect(validateArchiveProxyRequest('GET', '/projects')).toEqual({
      ok: true,
      value: '/projects',
    });
    expect(
      validateArchiveProxyRequest('GET', '/projects/proj-1/observations'),
    ).toEqual({
      ok: true,
      value: '/projects/proj-1/observations',
    });
    expect(
      validateArchiveProxyRequest(
        'POST',
        '/projects/proj-1/remoteDetectionAlerts',
      ),
    ).toEqual({
      ok: true,
      value: '/projects/proj-1/remoteDetectionAlerts',
    });

    // Attachment paths for authenticated image loading
    expect(
      validateArchiveProxyRequest(
        'GET',
        '/projects/proj-1/attachments/d1/photo/img.jpg',
      ),
    ).toEqual({
      ok: true,
      value: '/projects/proj-1/attachments/d1/photo/img.jpg',
    });
    expect(
      validateArchiveProxyRequest(
        'GET',
        '/projects/proj-1/attachments/d1/photo/img.jpg/thumbnail',
      ),
    ).toEqual({
      ok: true,
      value: '/projects/proj-1/attachments/d1/photo/img.jpg/thumbnail',
    });
  });

  it('rejects unsupported proxy methods and paths', () => {
    expect(validateArchiveProxyRequest('DELETE', '/projects')).toEqual({
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROXY_METHOD',
      message: 'Archive proxy only supports GET and POST requests',
    });
    expect(validateArchiveProxyRequest('GET', '/admin')).toEqual({
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROXY_PATH',
      message: 'Archive proxy path is not supported',
    });
    expect(validateArchiveProxyRequest('POST', '/projects')).toEqual({
      ok: false,
      code: 'UNSUPPORTED_ARCHIVE_PROXY_PATH',
      message: 'Archive proxy path is not supported',
    });
  });
});
