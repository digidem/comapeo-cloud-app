import { useEffect, useState } from 'react';

/**
 * Reactive media-query hook. Reads `window.matchMedia(query)` on first render
 * (lazy init) and keeps the value in sync via the query's `change` event.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sync with the external media list when `query` changes, before subscribing (lazy initializer only runs on mount)
    setMatches(mediaQueryList.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}
