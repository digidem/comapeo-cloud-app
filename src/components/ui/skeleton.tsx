import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

function Skeleton({
  width = '100%',
  height = 16,
  className = '',
}: SkeletonProps) {
  const style: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      data-testid="skeleton"
      className={`animate-pulse rounded bg-surface-container-low ${className}`}
      style={style}
    />
  );
}

export { Skeleton };
export type { SkeletonProps };
