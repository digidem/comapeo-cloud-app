import { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { type AreaUnit, convertArea } from '@/lib/area-format';

interface CoverageSummaryProps {
  activeMethodId: string;
  results: CoverageMethodResult[];
  isCalculating: boolean;
}

const UNIT_LABELS: Record<AreaUnit, string> = {
  ha: 'ha',
  m2: 'm²',
  km2: 'km²',
};

function renderAreaDisplay(
  isCalculating: boolean,
  areaM2: number | undefined,
  unit: AreaUnit,
) {
  if (isCalculating && areaM2 === undefined) {
    return <Skeleton width={120} height={40} />;
  }
  if (areaM2 !== undefined) {
    return (
      <span className="text-4xl font-bold text-[#172033]">
        {convertArea(areaM2, unit)}
      </span>
    );
  }
  return <span className="text-4xl font-bold text-gray-400">—</span>;
}

export function CoverageSummary({
  activeMethodId,
  results,
  isCalculating,
}: CoverageSummaryProps) {
  const [unit, setUnit] = useState<AreaUnit>('ha');

  const activeResult = results.find((r) => r.methodId === activeMethodId);
  const areaM2 = activeResult?.result?.areaM2;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        {renderAreaDisplay(isCalculating, areaM2, unit)}
      </div>
      <div className="flex gap-1">
        {(['ha', 'm2', 'km2'] as AreaUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={unit === u}
            aria-label={UNIT_LABELS[u]}
            onClick={() => setUnit(u)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              unit === u
                ? 'bg-[#1F6FFF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {UNIT_LABELS[u]}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AreaUnit };
