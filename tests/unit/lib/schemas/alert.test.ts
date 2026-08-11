import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  alertSchema,
  alertsResponseSchema,
  createAlertBodySchema,
} from '@/lib/schemas/alert';

const pointGeometry = {
  type: 'Point' as const,
  coordinates: [102.0, 0.5],
};

const validAlert = {
  docId: 'alert-1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deleted: false,
  detectionDateStart: '2025-01-01T00:00:00Z',
  detectionDateEnd: '2025-01-31T23:59:59Z',
  sourceId: 'source-1',
  metadata: { severity: 'high', confidence: 0.95 },
  geometry: pointGeometry,
};

describe('alertSchema', () => {
  it('parses a valid alert with only required fields', () => {
    const result = v.parse(alertSchema, validAlert);
    expect(result).toEqual(validAlert);
  });

  it('parses alert with all optional fields', () => {
    const data = {
      ...validAlert,
      detectionDateStart: '2025-01-01T00:00:00Z',
      detectionDateEnd: '2025-01-31T23:59:59Z',
      sourceId: 'source-1',
      metadata: { severity: 'high', confidence: 0.95 },
    };
    const result = v.parse(alertSchema, data);
    expect(result.detectionDateStart).toBe('2025-01-01T00:00:00Z');
    expect(result.detectionDateEnd).toBe('2025-01-31T23:59:59Z');
    expect(result.sourceId).toBe('source-1');
    expect(result.metadata).toEqual({ severity: 'high', confidence: 0.95 });
  });

  it.each([
    'detectionDateStart',
    'detectionDateEnd',
    'sourceId',
    'metadata',
    'geometry',
  ] as const)('rejects missing required %s', (key) => {
    const { [key]: _missing, ...data } = validAlert;
    expect(() => v.parse(alertSchema, data)).toThrow();
  });

  it('parses alert with Polygon geometry', () => {
    const data = {
      ...validAlert,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [100.0, 0.0],
            [101.0, 0.0],
            [101.0, 1.0],
            [100.0, 1.0],
            [100.0, 0.0],
          ],
        ],
      },
    };
    const result = v.parse(alertSchema, data);
    expect(result.geometry.type).toBe('Polygon');
  });

  it('rejects missing docId', () => {
    expect(() =>
      v.parse(alertSchema, {
        ...validAlert,
        docId: undefined,
      }),
    ).toThrow();
  });

  it('rejects missing geometry', () => {
    expect(() =>
      v.parse(alertSchema, {
        docId: 'alert-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deleted: false,
      }),
    ).toThrow();
  });

  it('rejects invalid geometry type', () => {
    expect(() =>
      v.parse(alertSchema, {
        ...validAlert,
        geometry: { type: 'Invalid', coordinates: [0, 0] },
      }),
    ).toThrow();
  });

  it('rejects non-boolean deleted', () => {
    expect(() =>
      v.parse(alertSchema, {
        ...validAlert,
        deleted: 'false',
      }),
    ).toThrow();
  });
});

describe('alertsResponseSchema', () => {
  it('parses valid alerts response', () => {
    const data = {
      data: [
        validAlert,
        {
          ...validAlert,
          docId: 'alert-2',
          sourceId: 'source-2',
        },
      ],
    };
    const result = v.parse(alertsResponseSchema, data);
    expect(result.data).toHaveLength(2);
  });

  it('parses empty data array', () => {
    const result = v.parse(alertsResponseSchema, { data: [] });
    expect(result.data).toEqual([]);
  });

  it('rejects missing data wrapper', () => {
    expect(() => v.parse(alertsResponseSchema, [validAlert])).toThrow();
  });

  it('rejects invalid alert in data array', () => {
    expect(() =>
      v.parse(alertsResponseSchema, {
        data: [{ invalid: true }],
      }),
    ).toThrow();
  });
});

describe('createAlertBodySchema', () => {
  const validBody = {
    geometry: pointGeometry,
    detectionDateStart: '2025-01-01T00:00:00Z',
    detectionDateEnd: '2025-01-31T23:59:59Z',
    sourceId: 'source-1',
    metadata: { type: 'deforestation', confidence: 0.9 },
  };

  it('parses the comapeo-cloud alert contract', () => {
    expect(v.parse(createAlertBodySchema, validBody)).toEqual(validBody);
  });

  it.each([
    'detectionDateStart',
    'detectionDateEnd',
    'sourceId',
    'metadata',
    'geometry',
  ] as const)('rejects missing required %s', (key) => {
    const { [key]: _missing, ...body } = validBody;
    expect(() => v.parse(createAlertBodySchema, body)).toThrow();
  });

  it('rejects invalid date-time values', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        ...validBody,
        detectionDateStart: '2025-01-01',
      }),
    ).toThrow();
  });

  it('rejects empty sourceId', () => {
    expect(() =>
      v.parse(createAlertBodySchema, { ...validBody, sourceId: '' }),
    ).toThrow();
  });

  it('rejects metadata values outside the server contract', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        ...validBody,
        metadata: { nested: { unsupported: true } },
      }),
    ).toThrow();
  });

  it('rejects coordinates outside server bounds', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        ...validBody,
        geometry: { type: 'Point', coordinates: [181, 0] },
      }),
    ).toThrow();
  });

  it('rejects lines with fewer than two positions', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        ...validBody,
        geometry: { type: 'LineString', coordinates: [[0, 0]] },
      }),
    ).toThrow();
  });
});
