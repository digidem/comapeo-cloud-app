import { defineMessages, useIntl } from 'react-intl';

import { Skeleton } from '@/components/ui/skeleton';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { type AreaUnit, convertArea } from '@/lib/area-format';

interface MethodCardProps {
  methodId: string;
  label: string;
  description: string;
  result?: CoverageMethodResult;
  isActive: boolean;
  unit: AreaUnit;
  onActivate: (methodId: string) => void;
  onExport?: (methodId: string) => void;
  color?: string;
}

const messages = defineMessages({
  export: {
    id: 'home.method.export',
    defaultMessage: 'Export',
  },
});

function renderAreaValue(
  hasError: boolean,
  isLoading: boolean,
  hasResult: boolean,
  result: CoverageMethodResult | undefined,
  unit: AreaUnit,
) {
  if (hasError) {
    return <span className="text-xs text-red-500">{result!.error}</span>;
  }
  if (isLoading) {
    return <Skeleton width={80} height={20} />;
  }
  if (hasResult) {
    return (
      <span
        data-testid="method-area-value"
        className="text-lg font-bold text-[#1F6FFF]"
      >
        {convertArea(result!.result!.areaM2, unit)}
      </span>
    );
  }
  return (
    <span
      data-testid="method-area-value"
      className="text-lg font-bold text-gray-300"
    >
      —
    </span>
  );
}

export function MethodCard({
  methodId,
  label,
  description,
  result,
  isActive,
  unit,
  onActivate,
  onExport,
  color = '#1F6FFF',
}: MethodCardProps) {
  const intl = useIntl();
  const hasResult = result?.result !== undefined;
  const hasError = result?.error !== undefined;
  const isLoading = result?.progress !== undefined && !hasResult && !hasError;

  function handleCardClick() {
    onActivate(methodId);
  }

  function handleExportClick(e: React.MouseEvent) {
    e.stopPropagation();
    onExport?.(methodId);
  }

  return (
    <div data-method-id={methodId} className="relative">
      <button
        type="button"
        aria-pressed={isActive}
        onClick={handleCardClick}
        className={`w-full rounded-[18px] border bg-white p-4 text-left shadow-[0_8px_24px_rgba(9,30,66,0.08)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          isActive
            ? 'ring-2 ring-[#1F6FFF] ring-offset-1'
            : 'border-[#D9DEE8] hover:border-[#1F6FFF]'
        }`}
        style={{ borderLeftWidth: 4, borderLeftColor: color }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-[#172033]">{label}</span>
          {renderAreaValue(hasError, isLoading, hasResult, result, unit)}
          <span className="text-xs text-gray-500">{description}</span>
        </div>
      </button>
      {hasResult && onExport && (
        <button
          type="button"
          aria-label={intl.formatMessage(messages.export)}
          onClick={handleExportClick}
          className="absolute right-3 top-3 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {intl.formatMessage(messages.export)}
        </button>
      )}
    </div>
  );
}

export type { MethodCardProps };
