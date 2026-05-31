/**
 * Mock for useAuthenticatedImageUrl hook.
 *
 * Returns a hardcoded success state with a fake blob URL.
 * Completely self-contained — zero @/ imports to avoid aliasing chain issues.
 *
 * Note: This mock always returns the "ready" state. Loading and error states
 * cannot be demonstrated without modifying this mock per-story. If needed in
 * the future, the mock could be enhanced to read from a module-level variable.
 */

interface AuthenticatedImageState {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAuthenticatedImageUrl(
  _url: string,
): AuthenticatedImageState {
  return {
    blobUrl: 'https://example.com/mock-audio.mp3',
    isLoading: false,
    error: null,
  };
}
