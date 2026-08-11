import * as v from 'valibot';

import { geometrySchema } from '@/lib/schemas/geometry';

export type AlertGeometryType = 'Point' | 'LineString' | 'Polygon';
export type Position = [number, number];
export type AlertGeometry = { type: AlertGeometryType; coordinates: unknown };

export type MetadataValueType = 'text' | 'number' | 'date' | 'boolean';
export interface MetadataRow {
  id: string;
  key: string;
  value: string;
  type: MetadataValueType;
}

export function geometryFromVertices(
  type: AlertGeometryType,
  vertices: Position[],
): AlertGeometry | undefined {
  if (type === 'Point') {
    const point = vertices[0];
    return point ? { type, coordinates: point } : undefined;
  }
  if (type === 'LineString') {
    return vertices.length >= 2 ? { type, coordinates: vertices } : undefined;
  }
  if (vertices.length < 3) return undefined;
  return { type, coordinates: [[...vertices, vertices[0]!]] };
}

export function validateGeometryDraft(
  type: AlertGeometryType,
  vertices: Position[],
): string | undefined {
  for (const [longitude, latitude] of vertices) {
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      return 'coordinates';
    }
  }

  if (type === 'Point' && vertices.length < 1) return 'pointRequired';
  if (type === 'LineString' && vertices.length < 2) return 'linePoints';
  if (type === 'Polygon' && vertices.length < 3) return 'polygonPoints';

  const geometry = geometryFromVertices(type, vertices);
  if (!geometry || !v.safeParse(geometrySchema, geometry).success) {
    return 'invalid';
  }
  return undefined;
}

export function metadataRowsToRecord(rows: MetadataRow[]): {
  value: Record<string, unknown>;
  errors: Record<string, string>;
} {
  const output: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      errors[row.id] = 'keyRequired';
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      errors[row.id] = 'duplicateKey';
      continue;
    }

    if (row.type === 'number') {
      if (row.value.trim() === '' || !Number.isFinite(Number(row.value))) {
        errors[row.id] = 'invalidNumber';
        continue;
      }
      output[key] = Number(row.value);
    } else if (row.type === 'boolean') {
      if (row.value !== 'true' && row.value !== 'false') {
        errors[row.id] = 'invalidBoolean';
        continue;
      }
      output[key] = row.value === 'true';
    } else {
      output[key] = row.value;
    }
  }

  return {
    value: output,
    errors,
  };
}
