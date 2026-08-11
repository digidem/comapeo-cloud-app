import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';

import { MapContainer } from '@/components/shared/MapContainer/MapContainer';
import { Button } from '@/components/ui/button';
import {
  type AlertGeometry,
  type AlertGeometryType,
  type Position,
  geometryFromVertices,
  validateGeometryDraft,
} from '@/lib/alert-form-utils';

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
});

interface GeometryPickerProps {
  onChange: (value: AlertGeometry | undefined) => void;
  onValidationChange?: (message: string | undefined) => void;
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

export function GeometryPicker({
  onChange,
  onValidationChange,
}: GeometryPickerProps) {
  const intl = useIntl();
  const [type, setType] = useState<AlertGeometryType>('Point');
  const [vertices, setVertices] = useState<DraftVertex[]>([]);
  const [showError, setShowError] = useState(false);
  const positions = useMemo(
    () => vertices.map((vertex) => vertex.position),
    [vertices],
  );
  const feature = useMemo(
    () => draftFeature(type, positions),
    [type, positions],
  );

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
    setShowError(false);
    onChange(undefined);
    onValidationChange?.(undefined);
  }

  function addPoint(longitude: number, latitude: number) {
    const vertex: DraftVertex = {
      id: crypto.randomUUID(),
      position: [longitude, latitude],
    };
    const next = type === 'Point' ? [vertex] : [...vertices, vertex];
    setVertices(next);
    setShowError(false);
    if (type === 'Point') {
      commit(next);
    } else {
      onChange(undefined);
      onValidationChange?.(undefined);
    }
  }

  function finish() {
    setShowError(true);
    commit(vertices);
  }

  const error = showError ? validationMessage() : undefined;
  let hint = messages.hintPolygon;
  if (type === 'Point') {
    hint = messages.hintPoint;
  } else if (type === 'LineString') {
    hint = messages.hintLine;
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium text-text">
          {intl.formatMessage(messages.typeLabel)}
        </legend>
        {(
          [
            ['Point', messages.point],
            ['LineString', messages.line],
            ['Polygon', messages.polygon],
          ] as const
        ).map(([geometryType, label]) => (
          <Button
            key={geometryType}
            type="button"
            variant={type === geometryType ? 'primary' : 'secondary'}
            onClick={() => chooseType(geometryType)}
            aria-pressed={type === geometryType}
          >
            {intl.formatMessage(label)}
          </Button>
        ))}
      </fieldset>

      <p className="text-sm text-text-muted">{intl.formatMessage(hint)}</p>
      <MapContainer
        height={360}
        className="rounded-card"
        initialViewState={{ longitude: -52.5, latitude: -3.5, zoom: 3 }}
        onClick={(event) => addPoint(event.lngLat.lng, event.lngLat.lat)}
      >
        {feature && (
          <Source id="alert-geometry-draft" type="geojson" data={feature}>
            {type === 'Polygon' && vertices.length >= 3 && (
              <Layer
                id="alert-geometry-fill"
                type="fill"
                paint={{ 'fill-color': '#1F6FFF', 'fill-opacity': 0.18 }}
              />
            )}
            <Layer
              id="alert-geometry-line"
              type="line"
              paint={{ 'line-color': '#1F6FFF', 'line-width': 3 }}
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
                      commit(next);
                    }
                  : undefined
              }
            >
              <div
                className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow"
                aria-label={intl.formatMessage(messages.vertexLabel, {
                  number: index + 1,
                })}
              />
            </Marker>
          );
        })}
      </MapContainer>

      <div className="flex flex-wrap gap-2">
        {type !== 'Point' && (
          <Button type="button" variant="primary" onClick={finish}>
            {intl.formatMessage(messages.finish)}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={vertices.length === 0}
          onClick={() => {
            const next = vertices.slice(0, -1);
            setVertices(next);
            setShowError(false);
            commit(next);
          }}
        >
          {intl.formatMessage(messages.undo)}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={vertices.length === 0}
          onClick={() => {
            setVertices([]);
            setShowError(false);
            onChange(undefined);
            onValidationChange?.(undefined);
          }}
        >
          {intl.formatMessage(messages.clear)}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
