import { vi } from 'vitest';

/**
 * jsdom does not implement URL.createObjectURL / URL.revokeObjectURL.
 * These shared mocks provide predictable blob URLs for tests.
 *
 * Each call to createObjectURL returns a unique, sequential URL
 * (blob:mocked-url-1, blob:mocked-url-2, …) so that tests can
 * detect accidental double-creation bugs.
 *
 * Usage:
 *   import { setupBlobUrlMocks } from '@tests/mocks/blob-url';
 *   const { createObjectUrlMock, revokeObjectUrlMock, resetCounter, getRevokedUrls } = setupBlobUrlMocks();
 */

let _counter = 0;

export function setupBlobUrlMocks() {
  _counter = 0;

  const createObjectUrlMock = vi.fn(() => {
    _counter++;
    return `blob:mocked-url-${_counter}`;
  });

  const revokeObjectUrlMock = vi.fn();

  // Preserve the URL constructor while adding createObjectURL/revokeObjectURL
  const OriginalURL = URL;
  const MockedURL = Object.assign(OriginalURL, {
    createObjectURL: createObjectUrlMock,
    revokeObjectURL: revokeObjectUrlMock,
  });

  vi.stubGlobal('URL', MockedURL);

  return {
    createObjectUrlMock,
    revokeObjectUrlMock,
    /** Reset the internal counter so the next createObjectURL returns blob:mocked-url-1 */
    resetCounter: () => {
      _counter = 0;
    },
    /** Return the set of URLs that have been revoked so far */
    getRevokedUrls: (): string[] =>
      revokeObjectUrlMock.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      ),
  };
}

export function restoreBlobUrlMocks() {
  // vitest restores globals automatically via vi.stubGlobal cleanup,
  // but this is available for explicit teardown if needed.
}
