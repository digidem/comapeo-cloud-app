import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { defineMessages, useIntl } from 'react-intl';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';

interface MethodSelectorProps {
  results: CoverageMethodResult[];
  activeMethodId: string;
  onActivate: (methodId: string) => void;
  onExport: () => void;
}

const messages = defineMessages({
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
  activeMethodId,
  onActivate,
  onExport,
}: MethodSelectorProps) {
  const intl = useIntl();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Algorithm Options"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[220px] rounded-md border border-gray-200 bg-white p-1 shadow-md data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade"
          sideOffset={5}
        >
          {METHOD_IDS.map((methodId) => {
            const meta = METHOD_META[methodId];
            if (!meta) return null;

            return (
              <DropdownMenu.Item
                key={methodId}
                className={`relative flex h-8 select-none items-center rounded-sm pl-8 pr-2 text-sm outline-none focus:bg-blue-100 focus:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:text-gray-300 ${
                  activeMethodId === methodId
                    ? 'font-semibold text-blue-700'
                    : 'text-gray-700'
                }`}
                onClick={() => onActivate(methodId)}
              >
                {activeMethodId === methodId && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-blue-600" />
                  </span>
                )}
                {intl.formatMessage(messages[meta.label])}
              </DropdownMenu.Item>
            );
          })}

          <DropdownMenu.Separator className="my-1 h-[1px] bg-gray-200" />

          <DropdownMenu.Item
            className="relative flex h-8 select-none items-center rounded-sm pl-8 pr-2 text-sm text-gray-700 outline-none focus:bg-blue-100 focus:text-blue-900"
            onClick={onExport}
          >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7.5 1V10.5M7.5 10.5L4 7M7.5 10.5L11 7M2 14H13"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Export Data
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
