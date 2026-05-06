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

  it('parses alert without optional fields', () => {
    const result = v.parse(alertSchema, validAlert);
    expect(result.detectionDateStart).toBeUndefined();
    expect(result.detectionDateEnd).toBeUndefined();
    expect(result.sourceId).toBeUndefined();
    expect(result.metadata).toBeUndefined();
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
  it('parses valid body with only required geometry', () => {
    const result = v.parse(createAlertBodySchema, {
      geometry: pointGeometry,
    });
    expect(result.geometry).toEqual(pointGeometry);
  });

  it('parses valid body with all optional fields', () => {
    const data = {
      geometry: pointGeometry,
      detectionDateStart: '2025-01-01T00:00:00Z',
      detectionDateEnd: '2025-01-31T23:59:59Z',
      sourceId: 'source-1',
      metadata: { type: 'deforestation' },
    };
    const result = v.parse(createAlertBodySchema, data);
    expect(result.detectionDateStart).toBe('2025-01-01T00:00:00Z');
    expect(result.detectionDateEnd).toBe('2025-01-31T23:59:59Z');
    expect(result.sourceId).toBe('source-1');
    expect(result.metadata).toEqual({ type: 'deforestation' });
  });

  it('rejects missing geometry', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        detectionDateStart: '2025-01-01T00:00:00Z',
      }),
    ).toThrow();
  });

  it('rejects invalid geometry', () => {
    expect(() =>
      v.parse(createAlertBodySchema, {
        geometry: { type: 'Invalid', coordinates: [0] },
      }),
    ).toThrow();
  });

  it('allows empty body with just geometry', () => {
    const result = v.parse(createAlertBodySchema, {
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    });
    expect(result.geometry.type).toBe('LineString');
    expect(result.detectionDateStart).toBeUndefined();
    expect(result.detectionDateEnd).toBeUndefined();
    expect(result.sourceId).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });
});
