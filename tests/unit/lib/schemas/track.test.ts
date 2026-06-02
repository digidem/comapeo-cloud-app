import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { trackSchema, tracksResponseSchema } from '@/lib/schemas/track';

describe('trackSchema', () => {
  const validTrack = {
    docId: 'track-001',
    versionId: 'track-001/0',
    originalVersionId: 'track-001/0',
    schemaName: 'track',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    links: [],
    deleted: false,
    locations: [
      {
        coords: {
          latitude: -8.35,
          longitude: -55.45,
        },
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 6,
      },
    ],
    observationRefs: [
      {
        docId: 'obs-001',
        versionId: 'obs-001/0',
        url: '/projects/proj1/observation/obs-001',
      },
    ],
    tags: { patrol: 'north' },
    presetRef: {
      docId: 'preset-001',
      versionId: 'preset-001/0',
      url: '/projects/proj1/preset/preset-001',
    },
  };

  it('validates a complete track', () => {
    const result = v.safeParse(trackSchema, validTrack);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.locations[0]!.coords.latitude).toBe(-8.35);
      expect(result.output.observationRefs[0]!.docId).toBe('obs-001');
      expect(result.output.versionId).toBe('track-001/0');
    }
  });

  it('validates a track with optional refs and metadata omitted', () => {
    const minimalTrack = {
      docId: 'track-002',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
    };

    const result = v.safeParse(trackSchema, minimalTrack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.locations).toEqual([]);
      expect(result.output.observationRefs).toEqual([]);
      expect(result.output.tags).toEqual({});
    }
  });

  it('accepts observationRef entries missing versionId and url', () => {
    const trackWithMinimalRefs = {
      docId: 'track-003',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
      observationRefs: [{ docId: 'obs-only-docid' }],
    };

    const result = v.safeParse(trackSchema, trackWithMinimalRefs);
    expect(result.success).toBe(true);
  });

  it('rejects track locations without coordinates', () => {
    const invalidTrack = {
      ...validTrack,
      locations: [{ timestamp: '2024-01-01T00:00:00Z' }],
    };

    expect(v.safeParse(trackSchema, invalidTrack).success).toBe(false);
  });
});

describe('tracksResponseSchema', () => {
  const validTrack = {
    docId: 'track-001',
    versionId: 'track-001/0',
    originalVersionId: 'track-001/0',
    schemaName: 'track',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    links: [],
    deleted: false,
    locations: [],
    observationRefs: [],
    tags: {},
  };

  it('validates a server tracks response', () => {
    expect(
      v.safeParse(tracksResponseSchema, { data: [validTrack] }).success,
    ).toBe(true);
  });

  it('accepts tracks missing locations, observationRefs, and tags fields', () => {
    const trackWithoutCollections = {
      docId: 'track-002',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deleted: false,
    };

    expect(
      v.safeParse(tracksResponseSchema, { data: [trackWithoutCollections] })
        .success,
    ).toBe(true);
  });
});
