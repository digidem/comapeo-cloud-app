/**
 * Mock for useAuthenticatedImageUrl hook.
 *
 * Returns a success state with a real, loadable data URI (a 100×100
 * primary-brand-color square). This is what AuthImg renders when the
 * underlying image fetch succeeds. Zero @/ imports to avoid aliasing
 * chain issues.
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

// 100x100 primary brand color (#1F6FFF) SVG — loadable by <img src=...>
const PLACEHOLDER_IMG =
  "data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231F6FFF'/></svg>";

export function useAuthenticatedImageUrl(
  _url: string,
): AuthenticatedImageState {
  return {
    blobUrl: PLACEHOLDER_IMG,
    isLoading: false,
    error: null,
  };
}
