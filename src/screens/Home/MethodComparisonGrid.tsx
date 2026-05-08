import { Skeleton } from '@/components/ui/skeleton';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import type { AreaUnit } from '@/lib/area-format';

import { MethodCard } from './MethodCard';

interface MethodComparisonGridProps {
  results: CoverageMethodResult[];
  activeMethodId: string;
  isCalculating: boolean;
  unit: AreaUnit;
  onActivate: (methodId: string) => void;
  onExport: (methodId: string) => void;
}

const METHOD_META: Record<
  string,
  { label: string; description: string; color: string }
> = {
  observed: {
    label: 'Observed Footprint',
    description: 'Buffer around each observation',
    color: '#1F6FFF',
  },
  connectivity10: {
    label: '10km Connectivity',
    description: 'Points reachable within 10km',
    color: '#7C3AED',
  },
  connectivity30: {
    label: '30km Connectivity',
    description: 'Points reachable within 30km',
    color: '#059669',
  },
  clusterHull: {
    label: 'Cluster Hull',
    description: 'Concave hull per cluster',
    color: '#D97706',
  },
  grid: {
    label: 'Occupied Grid',
    description: 'Grid cells with observations',
    color: '#DC2626',
  },
};

const METHOD_IDS = [
  'observed',
  'connectivity10',
  'connectivity30',
  'clusterHull',
  'grid',
] as const;

export function MethodComparisonGrid({
  results,
  activeMethodId,
  isCalculating,
  unit,
  onActivate,
  onExport,
}: MethodComparisonGridProps) {
  const showSkeletons = isCalculating && results.length === 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {METHOD_IDS.map((methodId) => {
        const meta = METHOD_META[methodId];
        if (!meta) return null;

        if (showSkeletons) {
          return (
            <div key={methodId} className="rounded-[18px] p-4">
              <Skeleton height={80} />
            </div>
          );
        }

        const result = results.find((r) => r.methodId === methodId);

        return (
          <MethodCard
            key={methodId}
            methodId={methodId}
            label={meta.label}
            description={meta.description}
            color={meta.color}
            result={result}
            isActive={activeMethodId === methodId}
            unit={unit}
            onActivate={onActivate}
            onExport={onExport}
          />
        );
      })}
    </div>
  );
}
