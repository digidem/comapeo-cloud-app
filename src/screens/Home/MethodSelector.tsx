import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';

interface MethodSelectorProps {
  results: CoverageMethodResult[];
  activeMethodId: string;
  onActivate: (methodId: string) => void;
  onExport: () => void;
}

const messages = defineMessages({
  mapLayer: {
    id: 'home.method.mapLayer',
    defaultMessage: 'Map Layer',
  },
  exportMapLayer: {
    id: 'home.method.exportMapLayer',
    defaultMessage: 'Export map layer',
  },
  observedLabel: {
    id: 'home.method.observed.label',
    defaultMessage: 'Observed Footprint',
  },
  connectivity10Label: {
    id: 'home.method.connectivity10.label',
    defaultMessage: '10km Connectivity',
  },
  connectivity30Label: {
    id: 'home.method.connectivity30.label',
    defaultMessage: '30km Connectivity',
  },
  clusterHullLabel: {
    id: 'home.method.clusterHull.label',
    defaultMessage: 'Cluster Hull',
  },
  gridLabel: {
    id: 'home.method.grid.label',
    defaultMessage: 'Occupied Grid',
  },
  methodError: {
    id: 'home.method.error',
    defaultMessage: 'Error',
  },
});

const METHOD_META: Record<string, { label: keyof typeof messages }> = {
  observed: { label: 'observedLabel' },
  connectivity10: { label: 'connectivity10Label' },
  connectivity30: { label: 'connectivity30Label' },
  clusterHull: { label: 'clusterHullLabel' },
  grid: { label: 'gridLabel' },
};

const METHOD_IDS = [
  'observed',
  'connectivity10',
  'connectivity30',
  'clusterHull',
  'grid',
] as const;

export function MethodSelector({
  results,
  activeMethodId,
  onActivate,
  onExport,
}: MethodSelectorProps) {
  const intl = useIntl();
  const activeResult = results.find(
    (result) => result.methodId === activeMethodId,
  );
  const canExport = Boolean(activeResult?.result);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text">
          {intl.formatMessage(messages.mapLayer)}
        </span>
        <Select value={activeMethodId} onValueChange={onActivate}>
          {METHOD_IDS.map((methodId) => {
            const meta = METHOD_META[methodId];
            if (!meta) return null;

            return (
              <Select.Item key={methodId} value={methodId}>
                {intl.formatMessage(messages[meta.label])}
              </Select.Item>
            );
          })}
        </Select>
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="w-fit gap-2"
        aria-label={intl.formatMessage(messages.exportMapLayer)}
        onClick={onExport}
        disabled={!canExport}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M7.5 1V10.5M7.5 10.5L4 7M7.5 10.5L11 7M2 14H13"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {intl.formatMessage(messages.exportMapLayer)}
      </Button>
    </div>
  );
}
