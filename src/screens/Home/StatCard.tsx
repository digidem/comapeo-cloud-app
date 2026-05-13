import { type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/useCountUp';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  valueColor?: string;
  staggerIndex?: number;
  isLoading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  valueColor = 'text-text',
  staggerIndex = 0,
  isLoading = false,
}: StatCardProps) {
  const displayValue = useCountUp(value);

  return (
    <Card
      className="flex flex-col p-5 h-full justify-between motion-safe:animate-fade-in"
      style={{ animationDelay: `${staggerIndex * 50}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wide text-text-muted uppercase">
          {title}
        </h3>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className={`text-4xl font-bold tracking-tight ${valueColor}`}>
        {isLoading ? <Skeleton height={40} width="60%" /> : displayValue}
      </div>
    </Card>
  );
}
