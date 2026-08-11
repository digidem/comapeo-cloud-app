import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useCreateMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { checkStorageQuota } from '@/lib/map/smp-download';
import { closeSmpReader, getSmpReader } from '@/lib/map/smp-serve';

import { mapMessages } from './messages';

interface ImportSmpButtonProps {
  projectLocalId: string | null;
}

type SmpStyle = {
  metadata?: Record<string, unknown>;
  sources?: Record<string, Record<string, unknown>>;
};

const WORLD_BBOX: SavedMap['bbox'] = [-180, -90, 180, 90];

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.smp$/i, '') || fileName;
}

function isBbox(value: unknown): value is SavedMap['bbox'] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function extractMetadata(style: SmpStyle, fileName: string) {
  const sources = Object.values(style.sources ?? {});
  const sourceWithBounds = sources.find((source) => isBbox(source.bounds));
  const attributions = sources
    .map((source) => source.attribution)
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  const minZoomValues = sources
    .map((source) => source.minzoom)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );
  const maxZoomValues = sources
    .map((source) => source.maxzoom)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );
  const metadataName = style.metadata?.name;

  return {
    name:
      typeof metadataName === 'string' && metadataName.trim()
        ? metadataName.trim()
        : fileNameWithoutExtension(fileName),
    bbox:
      sourceWithBounds && isBbox(sourceWithBounds.bounds)
        ? sourceWithBounds.bounds
        : WORLD_BBOX,
    attribution:
      attributions.length > 0
        ? [...new Set(attributions)].join(' · ')
        : undefined,
    minZoom: minZoomValues.length > 0 ? Math.min(...minZoomValues) : 0,
    maxZoom: maxZoomValues.length > 0 ? Math.max(...maxZoomValues) : 14,
  };
}

export function ImportSmpButton({ projectLocalId }: ImportSmpButtonProps) {
  const intl = useIntl();
  const createMap = useCreateMap();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  async function handleFile(file: File) {
    if (!projectLocalId) return;

    const importId = crypto.randomUUID();
    setError(null);
    setSuccess(false);
    setIsImporting(true);

    try {
      const quota = await checkStorageQuota(file.size);
      if (!quota.sufficient) {
        setError(intl.formatMessage(mapMessages.importQuotaExceeded));
        return;
      }

      let reader;
      try {
        reader = await getSmpReader(importId, file);
        await reader.opened();
        await reader.getVersion();
      } catch {
        setError(intl.formatMessage(mapMessages.importInvalidFile));
        return;
      }

      let style: SmpStyle;
      try {
        style = (await reader.getStyle()) as SmpStyle;
      } catch {
        setError(intl.formatMessage(mapMessages.importMissingStyle));
        return;
      }

      if (!style || typeof style !== 'object' || !style.sources) {
        setError(intl.formatMessage(mapMessages.importMissingStyle));
        return;
      }

      const metadata = extractMetadata(style, file.name);
      const now = new Date().toISOString();
      await createMap.mutateAsync({
        id: importId,
        projectLocalId,
        name: metadata.name,
        type: 'style',
        styleUrl: '',
        bbox: metadata.bbox,
        minZoom: metadata.minZoom,
        maxZoom: metadata.maxZoom,
        attribution: metadata.attribution,
        smpBlob: file,
        smpSize: file.size,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      });
      setSuccess(true);
    } catch {
      setError(intl.formatMessage(mapMessages.importInvalidFile));
    } finally {
      await closeSmpReader(importId);
      setIsImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".smp,application/zip"
        className="sr-only"
        aria-label={intl.formatMessage(mapMessages.importFileLabel)}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={isImporting || createMap.isPending}
        disabled={!projectLocalId || isImporting || createMap.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {intl.formatMessage(mapMessages.importButton)}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-success">
          {intl.formatMessage(mapMessages.importSuccess)}
        </p>
      ) : null}
    </div>
  );
}

export type { ImportSmpButtonProps };
