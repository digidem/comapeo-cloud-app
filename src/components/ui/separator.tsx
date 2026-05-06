import * as SeparatorPrimitive from '@radix-ui/react-separator';

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  decorative?: boolean;
}

function Separator({
  orientation = 'horizontal',
  className = '',
  decorative = true,
}: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={`shrink-0 bg-border ${
        orientation === 'horizontal' ? 'w-full h-px' : 'h-full w-px'
      } ${className}`}
    />
  );
}

export { Separator };
export type { SeparatorProps };
