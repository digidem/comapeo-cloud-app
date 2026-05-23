import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import type { Observation } from '@/lib/data-layer';
import { downloadText } from '@/lib/file-export';
import {
  buildExportFilename,
  observationsToCsv,
  observationsToGeoJson,
} from '@/lib/observation-export';

const messages = defineMessages({
  button: {
    id: 'data.export.button',
    defaultMessage: 'Export',
  },
  geojson: {
    id: 'data.export.geojson',
    defaultMessage: 'GeoJSON',
  },
  csv: {
    id: 'data.export.csv',
    defaultMessage: 'CSV',
  },
});

interface ExportObservationsButtonProps {
  observations: Observation[];
  projectName: string | undefined;
  disabled?: boolean;
}

export function ExportObservationsButton({
  observations,
  projectName,
  disabled = false,
}: ExportObservationsButtonProps) {
  const intl = useIntl();

  function handleExportGeoJson() {
    try {
      const fc = observationsToGeoJson(observations);
      const json = JSON.stringify(fc, null, 2);
      const filename = buildExportFilename(projectName, 'geojson');
      downloadText(json, filename, 'application/geo+json');
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  function handleExportCsv() {
    try {
      const csv = observationsToCsv(observations);
      const filename = buildExportFilename(projectName, 'csv');
      downloadText(csv, filename, 'text/csv');
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <Button variant="secondary" size="sm">
          {intl.formatMessage(messages.button)}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="bg-surface-card shadow-elevated rounded-card border border-border p-1"
        >
          <DropdownMenu.Item
            onSelect={handleExportGeoJson}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-text-muted"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            {intl.formatMessage(messages.geojson)}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={handleExportCsv}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-btn px-4 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-text-muted"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            {intl.formatMessage(messages.csv)}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
