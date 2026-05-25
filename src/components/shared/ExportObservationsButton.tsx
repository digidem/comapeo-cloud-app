import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { ExportSheet } from '@/components/shared/ExportSheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
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
  exportError: {
    id: 'data.export.error',
    defaultMessage: 'Export failed. Please try again.',
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
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);

  async function handleExportGeoJson() {
    try {
      const fc = observationsToGeoJson(observations);
      const json = JSON.stringify(fc, null, 2);
      const filename = buildExportFilename(projectName, 'geojson');
      downloadText(json, filename, 'application/geo+json');
    } catch (e) {
      console.error('Export failed:', e);
      addToast({
        variant: 'error',
        title: intl.formatMessage(messages.exportError),
      });
    }
  }

  async function handleExportCsv() {
    try {
      const csv = observationsToCsv(observations);
      const filename = buildExportFilename(projectName, 'csv');
      downloadText(csv, filename, 'text/csv');
    } catch (e) {
      console.error('Export failed:', e);
      addToast({
        variant: 'error',
        title: intl.formatMessage(messages.exportError),
      });
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {intl.formatMessage(messages.button)}
      </Button>
      <ExportSheet
        open={open}
        onOpenChange={setOpen}
        onExportGeoJson={handleExportGeoJson}
        onExportCsv={handleExportCsv}
      />
    </>
  );
}
