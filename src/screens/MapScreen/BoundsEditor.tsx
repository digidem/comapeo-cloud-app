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
    parsed.south === null || parsed.south < -90 || parsed.south > 90
      ? intl.formatMessage(mapMessages.invalidLatitude)
      : undefined;
  const northRangeError =
    parsed.north === null || parsed.north < -90 || parsed.north > 90
      ? intl.formatMessage(mapMessages.invalidLatitude)
      : undefined;

  const lngOrderError =
    !westRangeError && !eastRangeError && parsed.west! >= parsed.east!
      ? intl.formatMessage(mapMessages.invalidLngOrder)
      : undefined;
  const latOrderError =
    !southRangeError && !northRangeError && parsed.south! >= parsed.north!
      ? intl.formatMessage(mapMessages.invalidLatOrder)
      : undefined;

  const errors = {
    west: westRangeError,
    east: eastRangeError ?? lngOrderError,
    south: southRangeError,
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
  }

  function setBounds(nextBbox: [number, number, number, number]) {
    setDraft(draftFromBbox(nextBbox));
    onChange(nextBbox);
  }

  function handleUseCurrentView() {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;

    setBounds([
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]);
  }

  function handleUseProjectArea() {
    const points = projectPointsQuery.data;
    if (!points || points.features.length === 0) return;

    const nextBbox = bbox(points) as [number, number, number, number];
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
    </section>
  );
}

export type { BoundsEditorProps };
