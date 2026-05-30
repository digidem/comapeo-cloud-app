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

  it('parses observation metadata and typed attachment fields', () => {
    const result = v.parse(observationSchema, {
      ...validObservation,
      attachments: [
        {
          driveId: 'drive-1',
          type: 'photo',
          name: 'image.jpg',
          url: '/projects/proj/attachments/drive-1/photo/image.jpg',
          hash: 'abc123',
          mimeType: 'image/jpeg',
        },
      ],
      metadata: {
        manualLocation: true,
        accuracy: 8,
        source: 'mobile',
      },
    });

    expect(result.attachments[0]!.driveId).toBe('drive-1');
    expect(result.metadata).toEqual({
      manualLocation: true,
      accuracy: 8,
      source: 'mobile',
    });
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

  it('validates an observation with optional presetRef', () => {
    const data = {
      docId: 'abc123',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      lat: -8.35,
      lon: -55.45,
      attachments: [{ url: 'https://example.com/a.jpg' }],
      tags: { category: 'forest' },
      presetRef: {
        docId: 'preset-001',
        versionId: 'v1',
        url: '/projects/abc/preset/preset-001',
      },
    };
    const result = v.safeParse(observationSchema, data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.presetRef).toEqual({
        docId: 'preset-001',
        versionId: 'v1',
        url: '/projects/abc/preset/preset-001',
      });
    }
  });

  it('validates an observation without presetRef (backward compat)', () => {
    const data = {
      docId: 'abc123',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      attachments: [],
      tags: { category: 'forest' },
    };
    expect(v.safeParse(observationSchema, data).success).toBe(true);
  });

  it('rejects presetRef with missing required docId', () => {
    const data = {
      docId: 'abc123',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      attachments: [],
      tags: {},
      presetRef: { versionId: 'v1', url: '/foo' },
    };
    expect(v.safeParse(observationSchema, data).success).toBe(false);
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

  it('validates a response with presetRef on observations', () => {
    const response = {
      data: [
        {
          docId: 'obs-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deleted: false,
          attachments: [],
          tags: {},
          presetRef: { docId: 'p1', versionId: 'v1', url: '/p' },
        },
      ],
    };
    expect(v.safeParse(observationsResponseSchema, response).success).toBe(
      true,
    );
  });
});
