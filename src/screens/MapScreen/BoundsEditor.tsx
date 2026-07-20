import bbox from '@turf/bbox';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useIntl } from 'react-intl';
import type { MapRef } from 'react-map-gl/maplibre';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { getProjectPoints } from '@/lib/data-layer';
import {
  WEB_MERCATOR_LAT_LIMIT,
  crossesAntimeridian,
} from '@/lib/map/bbox-utils';

import { mapMessages } from './messages';

interface BoundsEditorProps {
  bbox: [number, number, number, number];
  onChange: (bbox: [number, number, number, number]) => void;
  projectLocalId: string | null;
  mapRef: RefObject<MapRef | null>;
}

type BoundsDraft = {
  west: string;
  south: string;
  east: string;
  north: string;
};

function draftFromBbox([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): BoundsDraft {
  return {
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
  };
}

function parseFinite(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function areBboxesEqual(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a.every((value, index) => value === b[index]);
}

export function BoundsEditor({
  bbox: value,
  onChange,
  projectLocalId,
  mapRef,
}: BoundsEditorProps) {
  const intl = useIntl();
  const [draft, setDraft] = useState(() => draftFromBbox(value));
  const [areaError, setAreaError] = useState<string | null>(null);
  const valueKey = value.join(',');
  const valueDraft = useMemo(() => {
    const [west = '', south = '', east = '', north = ''] = valueKey.split(',');
    return { west, south, east, north };
  }, [valueKey]);
  const latestPropValueKeyRef = useRef(valueKey);

  const projectPointsQuery = useQuery({
    queryKey: ['project-points', projectLocalId],
    queryFn: () => getProjectPoints(projectLocalId!),
    enabled: projectLocalId !== null,
  });

  const parsed = useMemo(() => {
    const west = parseFinite(draft.west);
    const south = parseFinite(draft.south);
    const east = parseFinite(draft.east);
    const north = parseFinite(draft.north);

    return {
      west,
      south,
      east,
      north,
      bbox:
        west === null || south === null || east === null || north === null
          ? null
          : ([west, south, east, north] as [number, number, number, number]),
    };
  }, [draft]);

  const westRangeError =
    parsed.west === null || parsed.west < -180 || parsed.west > 180
      ? intl.formatMessage(mapMessages.invalidLongitude)
      : undefined;
  const eastRangeError =
    parsed.east === null || parsed.east < -180 || parsed.east > 180
      ? intl.formatMessage(mapMessages.invalidLongitude)
      : undefined;
  const southRangeError =
    parsed.south === null ||
    parsed.south < -WEB_MERCATOR_LAT_LIMIT ||
    parsed.south > WEB_MERCATOR_LAT_LIMIT
      ? intl.formatMessage(mapMessages.invalidLatitude)
      : undefined;
  const northRangeError =
    parsed.north === null ||
    parsed.north < -WEB_MERCATOR_LAT_LIMIT ||
    parsed.north > WEB_MERCATOR_LAT_LIMIT
      ? intl.formatMessage(mapMessages.invalidLatitude)
      : undefined;

  const lngOrderError =
    parsed.west !== null && parsed.east !== null && parsed.west >= parsed.east
      ? intl.formatMessage(mapMessages.invalidLngOrder)
      : undefined;
  const latOrderError =
    parsed.south !== null &&
    parsed.north !== null &&
    parsed.south >= parsed.north
      ? intl.formatMessage(mapMessages.invalidLatOrder)
      : undefined;

  const errors = {
    west: westRangeError ?? lngOrderError,
    east: eastRangeError ?? lngOrderError,
    south: southRangeError ?? latOrderError,
    north: northRangeError ?? latOrderError,
  };

  const hasValidDraft =
    parsed.bbox !== null &&
    !errors.west &&
    !errors.south &&
    !errors.east &&
    !errors.north;

  useEffect(() => {
    if (!hasValidDraft || !parsed.bbox || areBboxesEqual(parsed.bbox, value)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (latestPropValueKeyRef.current === valueKey && parsed.bbox) {
        onChange(parsed.bbox);
      }
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [hasValidDraft, onChange, parsed.bbox, value, valueKey]);

  useEffect(() => {
    if (latestPropValueKeyRef.current === valueKey) {
      return;
    }

    latestPropValueKeyRef.current = valueKey;
    setDraft(valueDraft);
  }, [valueDraft, valueKey]);

  function updateDraft(key: keyof BoundsDraft, nextValue: string) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
    setAreaError(null);
  }

  function setBounds(nextBbox: [number, number, number, number]) {
    setDraft(draftFromBbox(nextBbox));
    onChange(nextBbox);
  }

  function validateBbox(b: [number, number, number, number]): string | null {
    const [west, south, east, north] = b;
    if (
      !Number.isFinite(west) ||
      !Number.isFinite(south) ||
      !Number.isFinite(east) ||
      !Number.isFinite(north)
    ) {
      return intl.formatMessage(mapMessages.invalidCoordinates);
    }
    if (
      south < -WEB_MERCATOR_LAT_LIMIT ||
      south > WEB_MERCATOR_LAT_LIMIT ||
      north < -WEB_MERCATOR_LAT_LIMIT ||
      north > WEB_MERCATOR_LAT_LIMIT
    ) {
      return intl.formatMessage(mapMessages.invalidLatitude);
    }
    if (west === east || south === north)
      {return intl.formatMessage(mapMessages.zeroAreaBounds);}
    if (west >= east) return intl.formatMessage(mapMessages.invalidLngOrder);
    if (south >= north) return intl.formatMessage(mapMessages.invalidLatOrder);
    if (crossesAntimeridian([west, east]))
      {return intl.formatMessage(mapMessages.antimeridianCrossing);}
    return null;
  }

  function handleUseCurrentView() {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;

    const nextBbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const error = validateBbox(nextBbox);
    if (error) {
      setAreaError(error);
      return;
    }
    setAreaError(null);
    setBounds(nextBbox);
  }

  function handleUseProjectArea() {
    const points = projectPointsQuery.data;
    if (!points || points.features.length === 0) return;

    const nextBbox = bbox(points) as [number, number, number, number];
    const error = validateBbox(nextBbox);
    if (error) {
      setAreaError(error);
      return;
    }
    setAreaError(null);
    setBounds(nextBbox);
  }

  const hasProjectPoints = (projectPointsQuery.data?.features.length ?? 0) > 0;
  const noProjectPoints =
    !projectPointsQuery.isPending &&
    projectLocalId !== null &&
    !hasProjectPoints;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.boundsTitle)}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={intl.formatMessage(mapMessages.west)}
          type="number"
          step="any"
          value={draft.west}
          onChange={(event) => updateDraft('west', event.target.value)}
          error={errors.west}
        />
        <Input
          label={intl.formatMessage(mapMessages.south)}
          type="number"
          step="any"
          value={draft.south}
          onChange={(event) => updateDraft('south', event.target.value)}
          error={errors.south}
        />
        <Input
          label={intl.formatMessage(mapMessages.east)}
          type="number"
          step="any"
          value={draft.east}
          onChange={(event) => updateDraft('east', event.target.value)}
          error={errors.east}
        />
        <Input
          label={intl.formatMessage(mapMessages.north)}
          type="number"
          step="any"
          value={draft.north}
          onChange={(event) => updateDraft('north', event.target.value)}
          error={errors.north}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={handleUseCurrentView}>
          {intl.formatMessage(mapMessages.useCurrentView)}
        </Button>
        {noProjectPoints ? (
          <Tooltip content={intl.formatMessage(mapMessages.noProjectPoints)}>
            <Button
              variant="secondary"
              onClick={handleUseProjectArea}
              disabled
              className="w-full"
            >
              {intl.formatMessage(mapMessages.useProjectArea)}
            </Button>
          </Tooltip>
        ) : (
          <Button
            variant="secondary"
            onClick={handleUseProjectArea}
            disabled={!hasProjectPoints}
            className="w-full"
          >
            {intl.formatMessage(mapMessages.useProjectArea)}
          </Button>
        )}
      </div>

      {noProjectPoints ? (
        <p className="text-xs text-text-muted">
          {intl.formatMessage(mapMessages.noProjectPoints)}
        </p>
      ) : null}

      {areaError ? (
        <p role="alert" className="text-sm text-error">
          {areaError}
        </p>
      ) : null}
    </section>
  );
}

export type { BoundsEditorProps };
