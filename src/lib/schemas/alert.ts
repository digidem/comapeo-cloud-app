import * as v from 'valibot';

import { geometrySchema } from './geometry';

export const alertSchema = v.object({
  docId: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deleted: v.boolean(),
  detectionDateStart: v.optional(v.string()),
  detectionDateEnd: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.unknown())),
  geometry: geometrySchema,
});

export const alertsResponseSchema = v.object({
  data: v.array(alertSchema),
});

export const createAlertBodySchema = v.object({
  geometry: geometrySchema,
  detectionDateStart: v.optional(v.string()),
  detectionDateEnd: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.unknown())),
});
