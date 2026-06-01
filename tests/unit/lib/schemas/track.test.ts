import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { trackSchema, tracksResponseSchema } from '@/lib/schemas/track';

describe('trackSchema', () => {
  const validTrack = {
    docId: 'track-001',
    versionId: 'track-001/0',
    originalVersionId: 'track-001/0',
    schemaName: 'track' as const,
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T08:30:00Z',
    links: [],
    deleted: false,
    locations: [
      {
        coords: { latitude: -8.35, longitude: -55.45 },
        timestamp: '2024-03-15T08:00:00Z',
      },
      {
        coords: { latitude: -8.36, longitude: -55.44 },
        timestamp: '2024-03-15T08:10:00Z',
      },
    ],
    observationRefs: [
      {
        docId: 'obs-001',
        versionId: 'obs-001/0',
        url: '/projects/proj1/observation/obs-001',
      },
    ],
    tags: { device: 'gps-tracker' },
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
      expect(result.output.docId).toBe('track-001');
      expect(result.output.locations).toHaveLength(2);
      expect(result.output.locations[0]!.coords.latitude).toBe(-8.35);
      expect(result.output.locations[0]!.coords.longitude).toBe(-55.45);
      expect(result.output.observationRefs).toHaveLength(1);
      expect(result.output.observationRefs[0]!.docId).toBe('obs-001');
      expect(result.output.presetRef?.docId).toBe('preset-001');
    }
  });

  it('rejects track missing required locations', () => {
    const { locations: _locations, ...rest } = validTrack;
    expect(v.safeParse(trackSchema, rest).success).toBe(false);
  });

  it('validates track without optional presetRef', () => {
    const { presetRef: _presetRef, ...rest } = validTrack;
    expect(v.safeParse(trackSchema, rest).success).toBe(true);
  });

  it('validates track with empty observationRefs', () => {
    const track = { ...validTrack, observationRefs: [] };
    expect(v.safeParse(trackSchema, track).success).toBe(true);
  });

  it('validates track with empty tags', () => {
    const track = { ...validTrack, tags: {} };
    expect(v.safeParse(trackSchema, track).success).toBe(true);
  });

  it('validates track with deleted: true (tombstone)', () => {
    const track = { ...validTrack, deleted: true };
    const result = v.safeParse(trackSchema, track);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.deleted).toBe(true);
    }
  });

  it('validates location without optional timestamp', () => {
    const track = {
      ...validTrack,
      locations: [{ coords: { latitude: 1.0, longitude: 2.0 } }],
    };
    expect(v.safeParse(trackSchema, track).success).toBe(true);
  });
});

describe('tracksResponseSchema', () => {
  it('validates a server tracks response', () => {
    const response = {
      data: [
        {
          docId: 'track-001',
          versionId: 'track-001/0',
          originalVersionId: 'track-001/0',
          schemaName: 'track',
          createdAt: '2024-03-15T08:00:00Z',
          updatedAt: '2024-03-15T08:30:00Z',
          links: [],
          deleted: false,
          locations: [],
          observationRefs: [],
          tags: {},
        },
      ],
    };
    expect(v.safeParse(tracksResponseSchema, response).success).toBe(true);
  });

  it('rejects a response with missing data array', () => {
    expect(v.safeParse(tracksResponseSchema, {}).success).toBe(false);
  });
});
