import type { CSSProperties, ReactNode } from 'react';

import { useIsDesktop } from '@/hooks/useIsDesktop';

export interface MapScreenLayoutProps {
  className?: string;
  style?: CSSProperties;
  sidebar?: ReactNode;
  topLeft?: ReactNode;
  /** Override top-left slot positioning to reserve adjacent map controls. */
  topLeftPositionClassName?: string;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  children?: ReactNode;
}

export function MapScreenLayout({
  className,
  style,
  sidebar,
  topLeft,
  topLeftPositionClassName,
  topRight,
  bottomLeft,
  bottomRight,
  children,
}: MapScreenLayoutProps) {
  const isDesktop = useIsDesktop();

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:flex-row ${className ?? ''}`}
      style={style}
    >
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-card bg-surface-card shadow-card">
        {children}

        {topLeft && (
          <div
            className={`absolute z-10 flex gap-2 ${
              topLeftPositionClassName ?? 'top-4 left-3 items-center'
            }`}
          >
            {topLeft}
          </div>
        )}

        {topRight && (
          <div className="absolute top-4 right-3 z-10 flex gap-2 items-center">
            {topRight}
          </div>
        )}

        {bottomLeft && (
          <div className="absolute bottom-4 left-4 z-10 flex gap-2 items-center">
            {bottomLeft}
          </div>
        )}

        {bottomRight && (
          <div className="absolute bottom-4 right-4 z-10 flex gap-2 items-center">
            {bottomRight}
          </div>
        )}
      </div>

      {/* eslint-disable-next-line eqeqeq -- intentional null/undefined check */}
      {isDesktop && sidebar != null && (
        <aside className="flex w-full max-w-[380px] shrink-0 flex-col overflow-y-auto rounded-card bg-surface-card px-4 pb-4 pt-6 shadow-card">
          {sidebar}
        </aside>
      )}
    </div>
  );
}
