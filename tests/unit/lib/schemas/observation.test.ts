import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  observationSchema,
  observationsResponseSchema,
} from '@/lib/schemas/observation';

describe('observationSchema', () => {
  const validObservation = {
    docId: 'obs-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deleted: false,
    attachments: [{ url: 'https://example.com/photo.jpg' }],
    tags: { species: 'jaguar', count: 2 },
  };

  it('parses a valid observation', () => {
    const result = v.parse(observationSchema, validObservation);
    expect(result).toEqual(validObservation);
  });

  it('parses observation with optional lat and lon', () => {
    const result = v.parse(observationSchema, {
      ...validObservation,
      lat: 10.5,
      lon: -85.3,
    });
    expect(result.lat).toBe(10.5);
    expect(result.lon).toBe(-85.3);
  });

  it('parses observation without optional lat/lon', () => {
    const result = v.parse(observationSchema, validObservation);
    expect(result.lat).toBeUndefined();
    expect(result.lon).toBeUndefined();
  });

  it('parses observation with empty attachments', () => {
    const result = v.parse(observationSchema, {
      ...validObservation,
      attachments: [],
    });
    expect(result.attachments).toEqual([]);
  });

  it('parses observation with empty tags', () => {
    const result = v.parse(observationSchema, {
      ...validObservation,
      tags: {},
    });
    expect(result.tags).toEqual({});
  });

  it('rejects missing docId', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        docId: undefined,
      }),
    ).toThrow();
  });

  it('rejects missing createdAt', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        createdAt: undefined,
      }),
    ).toThrow();
  });

  it('rejects missing updatedAt', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        updatedAt: undefined,
      }),
    ).toThrow();
  });

  it('rejects missing deleted', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        deleted: undefined,
      }),
    ).toThrow();
  });

  it('rejects non-boolean deleted', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        deleted: 'false',
      }),
    ).toThrow();
  });

  it('rejects non-number lat', () => {
    expect(() =>
      v.parse(observationSchema, {
        ...validObservation,
        lat: '10.5',
      }),
    ).toThrow();
  });

  it('rejects missing attachments', () => {
    expect(() =>
      v.parse(observationSchema, {
        docId: 'obs-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deleted: false,
        tags: {},
      }),
    ).toThrow();
  });

  it('rejects missing tags', () => {
    expect(() =>
      v.parse(observationSchema, {
        docId: 'obs-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deleted: false,
        attachments: [],
      }),
    ).toThrow();
  });
});

describe('observationsResponseSchema', () => {
  it('parses valid observations response', () => {
    const data = {
      data: [
        {
          docId: 'obs-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deleted: false,
          attachments: [],
          tags: {},
        },
        {
          docId: 'obs-2',
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
          deleted: true,
          lat: 10.5,
          lon: -85.3,
          attachments: [{ url: 'https://example.com/photo.jpg' }],
          tags: { key: 'value' },
        },
      ],
    };
    const result = v.parse(observationsResponseSchema, data);
    expect(result.data).toHaveLength(2);
  });

  it('parses empty data array', () => {
    const result = v.parse(observationsResponseSchema, { data: [] });
    expect(result.data).toEqual([]);
  });

  it('rejects missing data wrapper', () => {
    expect(() =>
      v.parse(observationsResponseSchema, [
        {
          docId: 'obs-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deleted: false,
          attachments: [],
          tags: {},
        },
      ]),
    ).toThrow();
  });

  it('rejects invalid observation in data array', () => {
    expect(() =>
      v.parse(observationsResponseSchema, {
        data: [{ invalidField: 'nope' }],
      }),
    ).toThrow();
  });
});
