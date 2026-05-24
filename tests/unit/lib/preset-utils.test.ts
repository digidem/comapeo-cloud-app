import { describe, expect, it } from 'vitest';

import type { Observation, Preset } from '@/lib/db';
import { matchObservationToPreset } from '@/lib/preset-utils';

const forestPreset: Preset = {
  localId: 'p:rf',
  projectLocalId: 'proj-1',
  sourceType: 'remoteArchive',
  sourceId: 's1',
  remoteId: 'preset-forest',
  name: 'Forest',
  color: '#00FF00',
  terms: ['tree', 'canopy'],
  fieldRefs: [],
  createdAt: '',
  updatedAt: '',
  dirtyLocal: false,
  deleted: false,
};

const waterPreset: Preset = {
  localId: 'p:wt',
  projectLocalId: 'proj-1',
  sourceType: 'remoteArchive',
  sourceId: 's1',
  remoteId: 'preset-water',
  name: 'Water',
  color: '#0000FF',
  terms: ['river'],
  fieldRefs: [],
  createdAt: '',
  updatedAt: '',
  dirtyLocal: false,
  deleted: false,
};

const presets = [forestPreset, waterPreset];

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    sourceType: 'remoteArchive',
    sourceId: 's1',
    remoteId: 'obs-1',
    tags: {},
    createdAt: '',
    updatedAt: '',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

describe('matchObservationToPreset', () => {
  it('matches by presetRefDocId when available in tags', () => {
    const obs = makeObs({
      tags: { category: 'forest-preset', presetRefDocId: 'preset-forest' },
    });
    const presetLookup = new Map<string, Preset>(
      presets.map((p) => [p.remoteId!, p]),
    );
    const result = matchObservationToPreset(obs, presetLookup);
    expect(result).toEqual(forestPreset);
  });

  it('returns undefined when no presetRefDocId and no category match', () => {
    const obs = makeObs({ tags: {} });
    const presetLookup = new Map<string, Preset>(
      presets.map((p) => [p.remoteId!, p]),
    );
    expect(matchObservationToPreset(obs, presetLookup)).toBeUndefined();
  });

  it('returns undefined when presetRefDocId does not match any preset', () => {
    const obs = makeObs({
      tags: { presetRefDocId: 'nonexistent' },
    });
    const presetLookup = new Map<string, Preset>(
      presets.map((p) => [p.remoteId!, p]),
    );
    expect(matchObservationToPreset(obs, presetLookup)).toBeUndefined();
  });

  it('returns undefined when map is empty', () => {
    const obs = makeObs({
      tags: { presetRefDocId: 'preset-forest' },
    });
    const emptyLookup = new Map<string, Preset>();
    expect(matchObservationToPreset(obs, emptyLookup)).toBeUndefined();
  });

  it('falls back to category name match when no presetRefDocId', () => {
    const obs = makeObs({
      tags: { category: 'Forest' },
    });
    const presetLookup = new Map<string, Preset>(
      presets.map((p) => [p.remoteId!, p]),
    );
    const result = matchObservationToPreset(obs, presetLookup);
    expect(result).toEqual(forestPreset);
  });

  it('falls back to category match via terms', () => {
    const obs = makeObs({
      tags: { category: 'tree' },
    });
    const presetLookup = new Map<string, Preset>(
      presets.map((p) => [p.remoteId!, p]),
    );
    const result = matchObservationToPreset(obs, presetLookup);
    expect(result).toEqual(forestPreset);
  });
});
