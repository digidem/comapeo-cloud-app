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
    const fc = observationsToGeoJson(observations);
    const json = JSON.stringify(fc, null, 2);
    const filename = buildExportFilename(projectName, 'geojson');
    downloadText(json, filename, 'application/geo+json');
  }

  function handleExportCsv() {
    const csv = observationsToCsv(observations);
    const filename = buildExportFilename(projectName, 'csv');
    downloadText(csv, filename, 'text/csv');
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <Button variant="secondary" size="sm">
          {intl.formatMessage(messages.button)}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={handleExportGeoJson}>
          {intl.formatMessage(messages.geojson)}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={handleExportCsv}>
          {intl.formatMessage(messages.csv)}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
