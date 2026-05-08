import { defineMessages, useIntl } from 'react-intl';

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

const messages = defineMessages({
  observedLabel: {
    id: 'home.method.observed.label',
    defaultMessage: 'Observed Footprint',
  },
  observedDescription: {
    id: 'home.method.observed.description',
    defaultMessage: 'Buffer around each observation',
  },
  connectivity10Label: {
    id: 'home.method.connectivity10.label',
    defaultMessage: '10km Connectivity',
  },
  connectivity10Description: {
    id: 'home.method.connectivity10.description',
    defaultMessage: 'Points reachable within 10km',
  },
  connectivity30Label: {
    id: 'home.method.connectivity30.label',
    defaultMessage: '30km Connectivity',
  },
  connectivity30Description: {
    id: 'home.method.connectivity30.description',
    defaultMessage: 'Points reachable within 30km',
  },
  clusterHullLabel: {
    id: 'home.method.clusterHull.label',
    defaultMessage: 'Cluster Hull',
  },
  clusterHullDescription: {
    id: 'home.method.clusterHull.description',
    defaultMessage: 'Concave hull per cluster',
  },
  gridLabel: {
    id: 'home.method.grid.label',
    defaultMessage: 'Occupied Grid',
  },
  gridDescription: {
    id: 'home.method.grid.description',
    defaultMessage: 'Grid cells with observations',
  },
});

const METHOD_META: Record<
  string,
  {
    label: keyof typeof messages;
    description: keyof typeof messages;
    color: string;
  }
> = {
  observed: {
    label: 'observedLabel',
    description: 'observedDescription',
    color: '#c35b2d',
  },
  connectivity10: {
    label: 'connectivity10Label',
    description: 'connectivity10Description',
    color: '#0f7b6c',
  },
  connectivity30: {
    label: 'connectivity30Label',
    description: 'connectivity30Description',
    color: '#b33f62',
  },
  clusterHull: {
    label: 'clusterHullLabel',
    description: 'clusterHullDescription',
    color: '#1d4ed8',
  },
  grid: {
    label: 'gridLabel',
    description: 'gridDescription',
    color: '#8860d0',
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
  const intl = useIntl();
  const showSkeletons = isCalculating && results.length === 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {METHOD_IDS.map((methodId) => {
        const meta = METHOD_META[methodId];
        if (!meta) return null;

        const result = results.find((r) => r.methodId === methodId);

        return (
          <MethodCard
            key={methodId}
            methodId={methodId}
            label={intl.formatMessage(messages[meta.label])}
            description={intl.formatMessage(messages[meta.description])}
            color={meta.color}
            result={showSkeletons ? { methodId, progress: '' } : result}
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
