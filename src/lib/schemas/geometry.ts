import * as v from 'valibot';

const position = v.array(v.number());

export const geometrySchema: v.GenericSchema<{
  type: string;
  coordinates: unknown;
}> = v.lazy(() =>
  v.union([
    v.object({
      type: v.literal('Point'),
      coordinates: position,
    }),
    v.object({
      type: v.literal('MultiPoint'),
      coordinates: v.array(position),
    }),
    v.object({
      type: v.literal('LineString'),
      coordinates: v.array(position),
    }),
    v.object({
      type: v.literal('MultiLineString'),
      coordinates: v.array(v.array(position)),
    }),
    v.object({
      type: v.literal('Polygon'),
      coordinates: v.array(v.array(position)),
    }),
    v.object({
      type: v.literal('MultiPolygon'),
      coordinates: v.array(v.array(v.array(position))),
    }),
  ]),
);
