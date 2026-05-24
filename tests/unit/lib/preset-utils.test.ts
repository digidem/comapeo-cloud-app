import { describe, expect, it } from 'vitest';

import type { Observation, Preset } from '@/lib/db';
import {
  getObservationDisplayNameSync,
  matchObservationToPreset,
} from '@/lib/preset-utils';

const forestPreset: Preset = {
  localId: 'p:rf',
  projectLocalId: 'proj-1',
  sourceType: 'remoteArchive',
  sourceId: 's1',
  remoteId: 'preset-forest',
  name: 'Forest',
  color: '#00FF00',
  tags: { category: 'forest-risk' },
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
  tags: { category: 'water-risk' },
  terms: ['river'],
  fieldRefs: [],
  createdAt: '',
  updatedAt: '',
  dirtyLocal: false,
  deleted: false,
};

const roadPreset: Preset = {
  localId: 'p:rd',
  projectLocalId: 'proj-1',
  sourceType: 'remoteArchive',
  sourceId: 's1',
  remoteId: 'preset-road',
  name: 'Road',
  color: '#FF0000',
  tags: { category: 'infrastructure', surface: 'paved' },
  terms: ['highway', 'street'],
  fieldRefs: [],
  createdAt: '',
  updatedAt: '',
  dirtyLocal: false,
  deleted: false,
};

const presets = [forestPreset, waterPreset, roadPreset];

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
  it('matches by presetRefDocId fast path', () => {
    const obs = makeObs({
      tags: { category: 'forest-risk', presetRefDocId: 'preset-forest' },
    });
    const result = matchObservationToPreset(obs, presets);
    expect(result).toEqual(forestPreset);
  });

  it('matches by presetRefDocId even when other tags would score higher', () => {
    // presetRefDocId should win regardless of tag scoring
    const obs = makeObs({
      tags: {
        category: 'water-risk',
        surface: 'paved',
        presetRefDocId: 'preset-forest',
      },
    });
    const result = matchObservationToPreset(obs, presets);
    expect(result).toEqual(forestPreset);
  });

  it('returns undefined when no presets available', () => {
    const obs = makeObs({
      tags: { presetRefDocId: 'preset-forest' },
    });
    expect(matchObservationToPreset(obs, [])).toBeUndefined();
  });

  it('returns undefined when no presets have tags (matching criteria)', () => {
    const obs = makeObs({
      tags: { category: 'forest-risk' },
    });
    // Presets without tags fields shouldn't match
    const taglessPresets = presets.map((p) => ({ ...p, tags: {} }));
    expect(matchObservationToPreset(obs, taglessPresets)).toBeUndefined();
  });

  it('matches by tag scoring: observation tags match preset tags', () => {
    const obs = makeObs({
      tags: { category: 'forest-risk' },
    });
    const result = matchObservationToPreset(obs, presets);
    expect(result).toEqual(forestPreset);
  });

  it('matches best score when multiple presets partially match', () => {
    // Road preset has {category: 'infrastructure', surface: 'paved'} (2 tags)
    // Forest preset has {category: 'forest-risk'} (1 tag)
    // Water preset has {category: 'water-risk'} (1 tag)
    // obs has {category: 'infrastructure'} — matches road (1/2 = 50%) and no others
    const obs = makeObs({
      tags: { category: 'infrastructure' },
    });
    const result = matchObservationToPreset(obs, presets);
    // roadPreset matches 1/2 tags (50%), others match 0 — road wins
    expect(result).toEqual(roadPreset);
  });

  it('best score wins when multiple presets match different counts', () => {
    // obs has {category: 'infrastructure', surface: 'paved'}
    // roadPreset matches both (2/2 = 100%) — highest score
    // forest/water match 0
    const obs = makeObs({
      tags: { category: 'infrastructure', surface: 'paved' },
    });
    const result = matchObservationToPreset(obs, presets);
    expect(result).toEqual(roadPreset);
  });

  it('returns undefined when observation tags do not match any preset tags', () => {
    const obs = makeObs({
      tags: { color: 'red' },
    });
    expect(matchObservationToPreset(obs, presets)).toBeUndefined();
  });

  it('ignores presetRefDocId when it does not match any preset remoteId', () => {
    const obs = makeObs({
      tags: { presetRefDocId: 'nonexistent', category: 'forest-risk' },
    });
    // Fast path fails, should fall back to tag scoring
    const result = matchObservationToPreset(obs, presets);
    expect(result).toEqual(forestPreset);
  });
});

describe('getObservationDisplayNameSync', () => {
  it('returns preset name when matched', () => {
    const obs = makeObs({
      tags: { category: 'forest-risk' },
    });
    expect(getObservationDisplayNameSync(obs, presets)).toBe('Forest');
  });

  it('returns Observation when no preset matches', () => {
    const obs = makeObs({
      tags: { color: 'red' },
    });
    expect(getObservationDisplayNameSync(obs, presets)).toBe('Observation');
  });

  it('returns Observation when presets array is empty', () => {
    const obs = makeObs({
      tags: { category: 'forest-risk' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Observation');
  });

  it('returns preset name via fast path (presetRefDocId matches remoteId)', () => {
    const obs = makeObs({
      tags: { presetRefDocId: 'preset-forest', category: 'forest-risk' },
    });
    expect(getObservationDisplayNameSync(obs, presets)).toBe('Forest');
  });

  it('returns preset name via tag scoring fallback (category tag matches)', () => {
    const obs = makeObs({
      tags: { category: 'infrastructure', surface: 'paved' },
    });
    expect(getObservationDisplayNameSync(obs, presets)).toBe('Road');
  });

  it('returns legacy display name when no presets match and tag has "yes" value', () => {
    const obs = makeObs({
      tags: { 'tree-sighting': 'yes' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Tree Sighting');
  });

  it('returns legacy display name when no presets match and tag has "true" value', () => {
    const obs = makeObs({
      tags: { caminho: 'true' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Caminho');
  });

  it('returns legacy display name with underscore formatting', () => {
    const obs = makeObs({
      tags: { water_contamination: 'yes' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Water Contamination');
  });

  it('returns legacy display name with mixed hyphens and underscores', () => {
    const obs = makeObs({
      tags: { 'forest_risk-area': 'yes' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Forest Risk Area');
  });

  it('returns Observation when no match and no legacy tag key', () => {
    const obs = makeObs({
      tags: { color: 'red' },
    });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Observation');
  });

  it('returns legacy name only when preset match fails (preset takes priority)', () => {
    // obs has a legacy tag AND a matching preset — preset should win
    const obs = makeObs({
      tags: { 'tree-sighting': 'yes', category: 'forest-risk' },
    });
    expect(getObservationDisplayNameSync(obs, presets)).toBe('Forest');
  });

  it('handles undefined tags gracefully', () => {
    const obs = makeObs({ tags: undefined });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Observation');
  });

  it('handles empty tags gracefully', () => {
    const obs = makeObs({ tags: {} });
    expect(getObservationDisplayNameSync(obs, [])).toBe('Observation');
  });

  it('picks the first tag key with "yes" value', () => {
    const obs = makeObs({
      tags: { alpha: 'yes', beta: 'yes' },
    });
    // Object key order is insertion order in modern JS engines
    expect(getObservationDisplayNameSync(obs, [])).toBe('Alpha');
  });
});
