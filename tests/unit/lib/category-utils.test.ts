import { describe, expect, it } from 'vitest';

import {
  buildObservationCategoryMetadata,
  buildProjectCategorySet,
} from '@/lib/category-utils';
import type { Observation, Preset } from '@/lib/db';

function makePreset(overrides: Partial<Preset>): Preset {
  return {
    localId: 'preset-local',
    projectLocalId: 'project-local',
    sourceType: 'remoteArchive',
    sourceId: 'server-1',
    remoteId: 'preset-remote',
    name: 'Preset',
    terms: [],
    fieldRefs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

function makeObservation(overrides: Partial<Observation>): Observation {
  return {
    localId: 'obs-local',
    projectLocalId: 'project-local',
    sourceType: 'remoteArchive',
    sourceId: 'server-1',
    remoteId: 'obs-remote',
    tags: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

describe('buildProjectCategorySet', () => {
  it('extracts category metadata from project presets with icon URLs', () => {
    const categories = buildProjectCategorySet(
      [
        makePreset({
          remoteId: 'forest',
          name: 'Forest',
          color: '#117733',
          iconDocId: 'icon-forest',
        }),
        makePreset({
          remoteId: 'water',
          name: 'Water',
        }),
      ],
      {
        projectRemoteId: 'remote-project',
        serverUrl: 'https://archive.example.com/base/',
      },
    );

    expect(categories).toEqual([
      {
        id: 'forest',
        name: 'Forest',
        color: '#117733',
        iconDocId: 'icon-forest',
        iconUrl:
          'https://archive.example.com/base/projects/remote-project/icon/icon-forest',
        preset: expect.objectContaining({ remoteId: 'forest' }),
      },
      {
        id: 'water',
        name: 'Water',
        color: undefined,
        iconDocId: undefined,
        iconUrl: undefined,
        preset: expect.objectContaining({ remoteId: 'water' }),
      },
    ]);
  });
});

describe('buildObservationCategoryMetadata', () => {
  it('maps observations to matched preset category metadata', () => {
    const forestPreset = makePreset({
      remoteId: 'forest',
      name: 'Forest',
      iconDocId: 'icon-forest',
    });
    const observation = makeObservation({
      localId: 'obs-forest',
      presetRefDocId: 'forest',
      tags: { category: 'legacy-category' },
    });

    const metadata = buildObservationCategoryMetadata(
      [observation],
      [forestPreset],
      {
        projectRemoteId: 'remote-project',
      },
    );

    expect(metadata.categoryByObservationId.get('obs-forest')).toMatchObject({
      id: 'forest',
      name: 'Forest',
      iconDocId: 'icon-forest',
      iconUrl: '/projects/remote-project/icon/icon-forest',
    });
    expect(metadata.displayNamesByObservationId.get('obs-forest')).toBe(
      'Forest',
    );
  });

  it('falls back to legacy display names without adding category metadata', () => {
    const observation = makeObservation({
      localId: 'obs-legacy',
      tags: { tree_sighting: 'yes' },
    });

    const metadata = buildObservationCategoryMetadata([observation], [], {});

    expect(metadata.categoryByObservationId.has('obs-legacy')).toBe(false);
    expect(metadata.displayNamesByObservationId.get('obs-legacy')).toBe(
      'Tree Sighting',
    );
  });

  it('adds fallback category metadata from tags.category without a matching preset', () => {
    const observation = makeObservation({
      localId: 'obs-tag-category',
      tags: { category: 'custom forest' },
    });

    const metadata = buildObservationCategoryMetadata([observation], [], {});

    expect(
      metadata.categoryByObservationId.get('obs-tag-category'),
    ).toMatchObject({
      id: 'tag:custom forest',
      name: 'custom forest',
    });
    expect(metadata.displayNamesByObservationId.get('obs-tag-category')).toBe(
      'custom forest',
    );
  });

  it('maps category tag values to preset category icons when direct refs are absent', () => {
    const forestPreset = makePreset({
      remoteId: 'preset-forest',
      name: 'Forest',
      iconDocId: 'icon-forest',
      tags: { category: 'forest' },
    });
    const observation = makeObservation({
      localId: 'obs-forest-tag',
      tags: { category: 'forest' },
    });

    const metadata = buildObservationCategoryMetadata(
      [observation],
      [forestPreset],
      {
        projectRemoteId: 'remote-project',
      },
    );

    expect(
      metadata.categoryByObservationId.get('obs-forest-tag'),
    ).toMatchObject({
      id: 'preset-forest',
      name: 'Forest',
      iconDocId: 'icon-forest',
      iconUrl: '/projects/remote-project/icon/icon-forest',
    });
    expect(metadata.displayNamesByObservationId.get('obs-forest-tag')).toBe(
      'Forest',
    );
  });
});
