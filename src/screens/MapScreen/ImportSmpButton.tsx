import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useCreateMap } from '@/hooks/useMaps';
import type { SavedMap } from '@/lib/db';
import { checkStorageQuota } from '@/lib/map/smp-download';
import {
  closeSmpReader,
  getSmpReader,
  sanitizeImportedSmpStyle,
  sanitizeSmpAttributionText,
} from '@/lib/map/smp-serve';
import { uuid } from '@/lib/uuid';

import { mapMessages } from './messages';

interface ImportSmpButtonProps {
  projectLocalId: string | null;
}

type SmpStyle = {
  metadata?: Record<string, unknown>;
  sources?: Record<string, Record<string, unknown>>;
};

const WORLD_BBOX: SavedMap['bbox'] = [-180, -90, 180, 90];
const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 14;
const MAX_IMPORT_ZOOM = 22;

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.smp$/i, '') || fileName;
}

function isBbox(value: unknown): value is SavedMap['bbox'] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    return false;
  }

  const [west, south, east, north] = value;
  return (
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  );
}

function extractMetadata(style: SmpStyle, fileName: string) {
  const sources = Object.values(style.sources ?? {});
  const sourceWithBounds = sources.find((source) => isBbox(source.bounds));
  let metadataBounds: SavedMap['bbox'] | undefined;
  if (isBbox(style.metadata?.['smp:regionalBounds'])) {
    metadataBounds = style.metadata['smp:regionalBounds'];
  } else if (isBbox(style.metadata?.['smp:bounds'])) {
    metadataBounds = style.metadata['smp:bounds'];
  }
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
  const minZoom =
    minZoomValues.length > 0 ? Math.min(...minZoomValues) : DEFAULT_MIN_ZOOM;
  const maxZoom =
    maxZoomValues.length > 0 ? Math.max(...maxZoomValues) : DEFAULT_MAX_ZOOM;
  const hasValidZoomRange =
    Number.isInteger(minZoom) &&
    Number.isInteger(maxZoom) &&
    minZoom >= DEFAULT_MIN_ZOOM &&
    maxZoom <= MAX_IMPORT_ZOOM &&
    minZoom <= maxZoom;

  return {
    name:
      typeof metadataName === 'string' && metadataName.trim()
        ? metadataName.trim()
        : fileNameWithoutExtension(fileName),
    bbox:
      metadataBounds ??
      (sourceWithBounds && isBbox(sourceWithBounds.bounds)
        ? sourceWithBounds.bounds
        : WORLD_BBOX),
    attribution:
      attributions.length > 0
        ? sanitizeSmpAttributionText([...new Set(attributions)].join(' · '))
        : undefined,
    minZoom: hasValidZoomRange ? minZoom : DEFAULT_MIN_ZOOM,
    maxZoom: hasValidZoomRange ? maxZoom : DEFAULT_MAX_ZOOM,
  };
}

export function ImportSmpButton({ projectLocalId }: ImportSmpButtonProps) {
  const intl = useIntl();
  const createMap = useCreateMap();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(false), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function handleFile(file: File) {
    if (!projectLocalId) return;

    const importId = uuid();
    setError(null);
    setSuccess(false);
    setIsImporting(true);

    try {
      let quota: Awaited<ReturnType<typeof checkStorageQuota>> | null = null;
      try {
        quota = await checkStorageQuota(file.size);
      } catch {
        // A failed estimate is not proof that storage is insufficient.
      }
      if (quota && !quota.sufficient) {
        setError(intl.formatMessage(mapMessages.importQuotaExceeded));
        return;
      }

      const smpBlob =
        file.type === 'application/zip'
          ? file
          : new Blob([file], { type: 'application/zip' });

      let reader;
      try {
        reader = await getSmpReader(importId, smpBlob);
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

      if (!sanitizeImportedSmpStyle(style as StyleSpecification)) {
        setError(intl.formatMessage(mapMessages.importOfflineOnly));
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
        smpBlob,
        smpSize: smpBlob.size,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      });
      setSuccess(true);
    } catch (caught) {
      const isQuotaExceeded =
        caught instanceof Error && caught.name === 'QuotaExceededError';
      setError(
        intl.formatMessage(
          isQuotaExceeded
            ? mapMessages.importQuotaExceeded
            : mapMessages.saveError,
        ),
      );
    } finally {
      try {
        await closeSmpReader(importId);
      } catch {
        // Reader cleanup must never strand the import control in a loading state.
      } finally {
        setIsImporting(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".smp,application/zip"
        className="sr-only"
        tabIndex={-1}
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
