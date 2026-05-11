import { defineMessages, useIntl } from 'react-intl';

import { Skeleton } from '@/components/ui/skeleton';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { type AreaUnit, convertArea } from '@/lib/area-format';

interface CoverageSummaryProps {
  activeMethodId: string;
  results: CoverageMethodResult[];
  isCalculating: boolean;
  unit: AreaUnit;
  onUnitChange: (unit: AreaUnit) => void;
}

const messages = defineMessages({
  hectares: {
    id: 'home.areaUnit.ha',
    defaultMessage: 'ha',
  },
  squareMeters: {
    id: 'home.areaUnit.m2',
    defaultMessage: 'm²',
  },
  squareKilometers: {
    id: 'home.areaUnit.km2',
    defaultMessage: 'km²',
  },
});

const UNIT_MESSAGES: Record<AreaUnit, keyof typeof messages> = {
  ha: 'hectares',
  m2: 'squareMeters',
  km2: 'squareKilometers',
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
      <span className="text-4xl font-bold text-text">
        {convertArea(areaM2, unit)}
      </span>
    );
  }
  return <span className="text-4xl font-bold text-text-muted">—</span>;
}

export function CoverageSummary({
  activeMethodId,
  results,
  isCalculating,
  unit,
  onUnitChange,
}: CoverageSummaryProps) {
  const intl = useIntl();

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
            aria-label={intl.formatMessage(messages[UNIT_MESSAGES[u]])}
            onClick={() => onUnitChange(u)}
            className={`rounded-md px-3 py-1 min-h-[44px] text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              unit === u
                ? 'bg-primary text-white'
                : 'bg-tag-neutral-bg text-tag-neutral-text hover:bg-surface'
            }`}
          >
            {intl.formatMessage(messages[UNIT_MESSAGES[u]])}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AreaUnit };
