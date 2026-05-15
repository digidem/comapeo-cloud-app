import { vi } from 'vitest';

/**
 * jsdom does not implement URL.createObjectURL / URL.revokeObjectURL.
 * These shared mocks provide predictable blob URLs for tests.
 *
 * Usage:
 *   import { setupBlobUrlMocks } from '@tests/mocks/blob-url';
 *   const { createObjectUrlMock, revokeObjectUrlMock } = setupBlobUrlMocks();
 */

export function setupBlobUrlMocks() {
  const createObjectUrlMock = vi.fn(() => 'blob:mocked-url');
  const revokeObjectUrlMock = vi.fn();

  // Preserve the URL constructor while adding createObjectURL/revokeObjectURL
  const OriginalURL = URL;
  const MockedURL = Object.assign(OriginalURL, {
    createObjectURL: createObjectUrlMock,
    revokeObjectURL: revokeObjectUrlMock,
  });

  vi.stubGlobal('URL', MockedURL);

  return { createObjectUrlMock, revokeObjectUrlMock };
}

export function restoreBlobUrlMocks() {
  // vitest restores globals automatically via vi.stubGlobal cleanup,
  // but this is available for explicit teardown if needed.
}
