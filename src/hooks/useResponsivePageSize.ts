import { useEffect, useState } from 'react';

const MOBILE_PAGE_SIZE = 50;
const DESKTOP_PAGE_SIZE = 60;
const BREAKPOINT = 768;

/**
 * Returns the page size for observation pagination.
 * 50 items per page on mobile (<768px), 60 on desktop.
 */
export function useResponsivePageSize(): number {
  const [pageSize, setPageSize] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= BREAKPOINT
      ? DESKTOP_PAGE_SIZE
      : MOBILE_PAGE_SIZE,
  );

  useEffect(() => {
    const handler = () => {
      setPageSize(
        window.innerWidth >= BREAKPOINT ? DESKTOP_PAGE_SIZE : MOBILE_PAGE_SIZE,
      );
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return pageSize;
}
