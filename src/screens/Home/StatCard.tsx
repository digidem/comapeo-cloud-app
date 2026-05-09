import { type ReactNode } from 'react';

import { Card } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  valueColor?: string;
}

export function StatCard({
  title,
  value,
  icon,
  valueColor = 'text-gray-900',
}: StatCardProps) {
  return (
    <Card className="flex flex-col p-5 h-full justify-between">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">
          {title}
        </h3>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <div className={`text-4xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </div>
    </Card>
  );
}
