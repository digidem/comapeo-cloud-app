import * as v from 'valibot';

import { geometrySchema } from './geometry';

const dateTime = v.pipe(v.string(), v.isoTimestamp());
const metadataScalar = v.union([v.boolean(), v.number(), v.string(), v.null()]);
const metadataValue = v.union([metadataScalar, v.array(metadataScalar)]);
const metadata = v.record(v.string(), metadataValue);
const sourceId = v.pipe(v.string(), v.minLength(1));

export const alertSchema = v.object({
  docId: v.string(),
  createdAt: dateTime,
  updatedAt: dateTime,
  deleted: v.boolean(),
  detectionDateStart: dateTime,
  detectionDateEnd: dateTime,
  sourceId,
  metadata,
  geometry: geometrySchema,
});

export const alertsResponseSchema = v.object({
  data: v.array(alertSchema),
});

export const createAlertBodySchema = v.object({
  geometry: geometrySchema,
  detectionDateStart: dateTime,
  detectionDateEnd: dateTime,
  sourceId,
  metadata,
});
