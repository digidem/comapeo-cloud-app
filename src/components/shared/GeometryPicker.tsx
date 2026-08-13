import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Layer, type MapRef, Marker, Source } from 'react-map-gl/maplibre';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import { Button } from '@/components/ui/button';
import {
  type AlertGeometry,
  type AlertGeometryType,
  type Position,
  geometryFromVertices,
  validateGeometryDraft,
} from '@/lib/alert-form-utils';
import { getProjectPoints } from '@/lib/data-layer';
import { finalizeBbox } from '@/lib/map/bbox-utils';
import { uuid } from '@/lib/uuid';

const messages = defineMessages({
  typeLabel: {
    id: 'alerts.create.geometryType',
    defaultMessage: 'Geometry type',
  },
  point: { id: 'alerts.create.geometryPoint', defaultMessage: 'Point' },
  line: { id: 'alerts.create.geometryLine', defaultMessage: 'Line' },
  polygon: { id: 'alerts.create.geometryPolygon', defaultMessage: 'Polygon' },
  hintPoint: {
    id: 'alerts.create.geometryHintPoint',
    defaultMessage: 'Click or tap the map to place the alert point.',
  },
  hintLine: {
    id: 'alerts.create.geometryHintLine',
    defaultMessage: 'Click or tap to add line points, then finish.',
  },
  hintPolygon: {
    id: 'alerts.create.geometryHintPolygon',
    defaultMessage: 'Click or tap to add polygon points, then finish.',
  },
  undo: { id: 'alerts.create.geometryUndo', defaultMessage: 'Undo last point' },
  clear: { id: 'alerts.create.geometryClear', defaultMessage: 'Clear' },
  finish: { id: 'alerts.create.geometryFinish', defaultMessage: 'Finish' },
  pointRequired: {
    id: 'alerts.create.geometryPointRequired',
    defaultMessage: 'Place a point on the map.',
  },
  linePoints: {
    id: 'alerts.create.geometryLinePoints',
    defaultMessage: 'A line needs at least 2 points.',
  },
  polygonPoints: {
    id: 'alerts.create.geometryPolygonPoints',
    defaultMessage: 'A polygon needs at least 3 points.',
  },
  coordinates: {
    id: 'alerts.create.geometryCoordinates',
    defaultMessage: 'Coordinates must be valid longitude and latitude values.',
  },
  invalid: {
    id: 'alerts.create.geometryInvalid',
    defaultMessage: 'This geometry is not valid.',
  },
  vertexLabel: {
    id: 'alerts.create.geometryVertexLabel',
    defaultMessage: 'Vertex {number}',
  },
  longitude: {
    id: 'alerts.create.geometryLongitude',
    defaultMessage: 'Longitude',
  },
  latitude: {
    id: 'alerts.create.geometryLatitude',
    defaultMessage: 'Latitude',
  },
  addCoordinates: {
    id: 'alerts.create.geometryAddCoordinates',
    defaultMessage: 'Add point',
  },
});

export interface GeometryPickerProps {
  projectLocalId?: string;
  onChange: (value: AlertGeometry | undefined) => void;
  onValidationChange?: (message: string | undefined) => void;
  showMap?: boolean;
  allowedTypes?: readonly AlertGeometryType[];
  externalPoint?: [number, number];
}

interface DraftVertex {
  id: string;
  position: Position;
}

function draftFeature(type: AlertGeometryType, vertices: Position[]) {
  if (type === 'Point' || vertices.length === 0) return undefined;
  if (type === 'LineString') {
    if (vertices.length < 2) return undefined;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: vertices },
    };
  }
  if (vertices.length < 3) return undefined;
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[...vertices, vertices[0]!]],
    },
  };
}

function GeometryTypePicker({
  type,
  allowedTypes,
  onChange,
}: {
  type: AlertGeometryType;
  allowedTypes: readonly AlertGeometryType[];
  onChange: (type: AlertGeometryType) => void;
}) {
  const intl = useIntl();
  const options = [
    ['Point', messages.point],
    ['LineString', messages.line],
    ['Polygon', messages.polygon],
  ] as const;
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium text-text">
        {intl.formatMessage(messages.typeLabel)}
      </legend>
      {options
        .filter(([geometryType]) => allowedTypes.includes(geometryType))
        .map(([geometryType, label]) => (
          <Button
            key={geometryType}
            type="button"
            variant={type === geometryType ? 'primary' : 'secondary'}
            onClick={() => onChange(geometryType)}
            aria-pressed={type === geometryType}
          >
            {intl.formatMessage(label)}
          </Button>
        ))}
    </fieldset>
  );
}

function CoordinateEntry({
  longitude,
  latitude,
  onLongitudeChange,
  onLatitudeChange,
  onAdd,
}: {
  longitude: string;
  latitude: string;
  onLongitudeChange: (value: string) => void;
  onLatitudeChange: (value: string) => void;
  onAdd: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-sm font-medium text-text">
        {intl.formatMessage(messages.longitude)}
        <input
          type="number"
          min={-180}
          max={180}
          step="any"
          value={longitude}
          onChange={(event) => onLongitudeChange(event.target.value)}
          className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-text">
        {intl.formatMessage(messages.latitude)}
        <input
          type="number"
          min={-90}
          max={90}
          step="any"
          value={latitude}
          onChange={(event) => onLatitudeChange(event.target.value)}
          className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
        />
      </label>
      <Button type="button" variant="secondary" onClick={onAdd}>
        {intl.formatMessage(messages.addCoordinates)}
      </Button>
    </div>
  );
}

function GeometryActions({
  type,
  hasVertices,
  onFinish,
  onUndo,
  onClear,
}: {
  type: AlertGeometryType;
  hasVertices: boolean;
  onFinish: () => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex flex-wrap gap-2">
      {type !== 'Point' && (
        <Button type="button" variant="primary" onClick={onFinish}>
          {intl.formatMessage(messages.finish)}
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={!hasVertices}
        onClick={onUndo}
      >
        {intl.formatMessage(messages.undo)}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={!hasVertices}
        onClick={onClear}
      >
        {intl.formatMessage(messages.clear)}
      </Button>
    </div>
  );
}

export function GeometryPicker({
  projectLocalId,
  onChange,
  onValidationChange,
  showMap = true,
  allowedTypes = ['Point', 'LineString', 'Polygon'],
  externalPoint,
}: GeometryPickerProps) {
  const intl = useIntl();
  const mapRef = useRef<MapRef>(null);
  const mapLoadedRef = useRef(false);
  const [projectArea, setProjectArea] = useState<{
    projectLocalId: string;
    bounds: [[number, number], [number, number]];
  }>();
  const projectBounds =
    projectArea && projectArea.projectLocalId === projectLocalId
      ? projectArea.bounds
      : undefined;
  const [type, setType] = useState<AlertGeometryType>('Point');
  const [vertices, setVertices] = useState<DraftVertex[]>(() =>
    externalPoint ? [{ id: 'external-point', position: externalPoint }] : [],
  );
  const [manualLongitude, setManualLongitude] = useState(() =>
    externalPoint ? String(externalPoint[0]) : '',
  );
  const [manualLatitude, setManualLatitude] = useState(() =>
    externalPoint ? String(externalPoint[1]) : '',
  );
  const positions = useMemo(
    () => vertices.map((vertex) => vertex.position),
    [vertices],
  );
  const feature = useMemo(
    () => draftFeature(type, positions),
    [type, positions],
  );

  const fitProjectArea = useCallback(
    (bounds = projectBounds) => {
      if (!bounds || !mapLoadedRef.current || !mapRef.current) return;
      mapRef.current.fitBounds(bounds, {
        padding: { top: 64, bottom: 32, left: 32, right: 32 },
        maxZoom: 14,
        duration: 0,
      });
    },
    [projectBounds],
  );

  useEffect(() => {
    if (!projectLocalId || !showMap) return;
    let cancelled = false;
    void getProjectPoints(projectLocalId)
      .then((points) => {
        if (cancelled || !points?.features.length) return;
        const coordinates = points.features.flatMap((feature) => {
          if (
            feature.geometry?.type !== 'Point' ||
            !Array.isArray(feature.geometry.coordinates) ||
            feature.geometry.coordinates.length !== 2
          ) {
            return [];
          }
          const [longitude, latitude] = feature.geometry.coordinates;
          return Number.isFinite(longitude) && Number.isFinite(latitude)
            ? ([[longitude, latitude]] as [number, number][])
            : [];
        });
        if (coordinates.length === 0) return;
        const bounds = finalizeBbox(
          coordinates.map(([longitude]) => longitude),
          coordinates.map(([, latitude]) => latitude),
        );
        if (!bounds) return;
        setProjectArea({
          projectLocalId,
          bounds: [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
        });
      })
      .catch(() => {
        // Keep the shared Amazon fallback view when project points cannot be read.
      });
    return () => {
      cancelled = true;
    };
  }, [projectLocalId, showMap]);

  useEffect(() => {
    fitProjectArea();
  }, [fitProjectArea]);

  function validationMessage(nextVertices = vertices, nextType = type) {
    const key = validateGeometryDraft(
      nextType,
      nextVertices.map((vertex) => vertex.position),
    );
    return key
      ? intl.formatMessage(messages[key as keyof typeof messages])
      : undefined;
  }

  function commit(nextVertices: DraftVertex[], nextType = type) {
    const error = validationMessage(nextVertices, nextType);
    onValidationChange?.(error);
    const nextPositions = nextVertices.map((vertex) => vertex.position);
    if (!error) onChange(geometryFromVertices(nextType, nextPositions));
    else onChange(undefined);
  }

  function chooseType(nextType: AlertGeometryType) {
    setType(nextType);
    setVertices([]);
    setManualLongitude('');
    setManualLatitude('');
    onChange(undefined);
    onValidationChange?.(undefined);
  }

  function addPoint(longitude: number, latitude: number) {
    const vertex: DraftVertex = {
      id: uuid(),
      position: [longitude, latitude],
    };
    const next = type === 'Point' ? [vertex] : [...vertices, vertex];
    setVertices(next);
    if (type === 'Point') {
      setManualLongitude(String(longitude));
      setManualLatitude(String(latitude));
      commit(next);
    } else {
      onChange(undefined);
      onValidationChange?.(undefined);
    }
  }

  function finish() {
    commit(vertices);
  }

  function addManualPoint() {
    const longitude = Number(manualLongitude);
    const latitude = Number(manualLatitude);
    if (
      manualLongitude.trim() === '' ||
      manualLatitude.trim() === '' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      onChange(undefined);
      onValidationChange?.(intl.formatMessage(messages.coordinates));
      return;
    }
    addPoint(longitude, latitude);
    if (type !== 'Point') {
      setManualLongitude('');
      setManualLatitude('');
    }
  }

  let hint = messages.hintPolygon;
  if (type === 'Point') {
    hint = messages.hintPoint;
  } else if (type === 'LineString') {
    hint = messages.hintLine;
  }

  return (
    <div className="flex flex-col gap-3">
      <GeometryTypePicker
        type={type}
        allowedTypes={allowedTypes}
        onChange={chooseType}
      />

      <p className="text-sm text-text-muted">{intl.formatMessage(hint)}</p>
      {showMap ? (
        <MapContainer
          mapRef={mapRef}
          height={360}
          className="rounded-card"
          initialViewState={{ longitude: -60, latitude: -3, zoom: 4 }}
          onLoad={() => {
            mapLoadedRef.current = true;
            fitProjectArea();
          }}
          onClick={(event) => addPoint(event.lngLat.lng, event.lngLat.lat)}
        >
          {feature && (
            <Source id="alert-geometry-draft" type="geojson" data={feature}>
              {type === 'Polygon' && vertices.length >= 3 && (
                <Layer
                  id="alert-geometry-fill"
                  type="fill"
                  paint={{ 'fill-color': '#dc2626', 'fill-opacity': 0.18 }}
                />
              )}
              <Layer
                id="alert-geometry-line"
                type="line"
                paint={{ 'line-color': '#dc2626', 'line-width': 3 }}
              />
            </Source>
          )}
          {vertices.map((vertex, index) => {
            const [longitude, latitude] = vertex.position;
            return (
              <Marker
                key={vertex.id}
                longitude={longitude}
                latitude={latitude}
                draggable={type === 'Point'}
                onDragEnd={
                  type === 'Point'
                    ? (event) => {
                        const next: DraftVertex[] = [
                          {
                            ...vertex,
                            position: [event.lngLat.lng, event.lngLat.lat],
                          },
                        ];
                        setVertices(next);
                        setManualLongitude(String(event.lngLat.lng));
                        setManualLatitude(String(event.lngLat.lat));
                        commit(next);
                      }
                    : undefined
                }
              >
                <div
                  role="img"
                  className="h-4 w-4 rounded-full border-2 border-white bg-error shadow"
                  aria-label={intl.formatMessage(messages.vertexLabel, {
                    number: index + 1,
                  })}
                />
              </Marker>
            );
          })}
        </MapContainer>
      ) : null}

      <CoordinateEntry
        longitude={manualLongitude}
        latitude={manualLatitude}
        onLongitudeChange={setManualLongitude}
        onLatitudeChange={setManualLatitude}
        onAdd={addManualPoint}
      />

      <GeometryActions
        type={type}
        hasVertices={vertices.length > 0}
        onFinish={finish}
        onUndo={() => {
          const next = vertices.slice(0, -1);
          setVertices(next);
          if (type === 'Point') {
            setManualLongitude('');
            setManualLatitude('');
            commit(next);
          } else {
            onChange(undefined);
            onValidationChange?.(undefined);
          }
        }}
        onClear={() => {
          setVertices([]);
          setManualLongitude('');
          setManualLatitude('');
          onChange(undefined);
          onValidationChange?.(undefined);
        }}
      />
    </div>
  );
}
