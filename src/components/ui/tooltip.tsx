import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function TooltipRoot({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span>{children}</span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className="z-50 rounded-[8px] bg-text px-3 py-1.5 text-xs text-white shadow-md animate-in fade-in-0 zoom-in-95"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

const Tooltip = Object.assign(TooltipRoot, {
  Trigger: TooltipPrimitive.Trigger,
  Content: TooltipPrimitive.Content,
});

export { Tooltip };
export type { TooltipProps };
