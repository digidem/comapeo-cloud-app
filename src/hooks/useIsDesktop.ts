import { useEffect, useState } from 'react';

const LG_BREAKPOINT = 1024;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= LG_BREAKPOINT,
  );

  useEffect(() => {
    const handler = () => {
      setIsDesktop(window.innerWidth >= LG_BREAKPOINT);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isDesktop;
}
