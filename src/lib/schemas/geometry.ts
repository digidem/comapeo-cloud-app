import * as v from 'valibot';

const longitude = v.pipe(v.number(), v.minValue(-180), v.maxValue(180));
const latitude = v.pipe(v.number(), v.minValue(-90), v.maxValue(90));
const position = v.tuple([longitude, latitude]);
const line = v.pipe(v.array(position), v.minLength(2));
const linearRing = v.pipe(v.array(position), v.minLength(4));

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
      coordinates: line,
    }),
    v.object({
      type: v.literal('MultiLineString'),
      coordinates: v.array(line),
    }),
    v.object({
      type: v.literal('Polygon'),
      coordinates: v.array(linearRing),
    }),
    v.object({
      type: v.literal('MultiPolygon'),
      coordinates: v.array(v.array(linearRing)),
    }),
  ]),
);
