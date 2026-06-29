import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import { DEFAULT_BASEMAP_ID } from '@/lib/map/basemaps';
import { useMapStore } from '@/stores/map-store';

beforeEach(() => {
  localStorage.clear();
  useMapStore.setState({ basemapId: DEFAULT_BASEMAP_ID });
});

afterEach(() => {
  localStorage.clear();
});

describe('map-store', () => {
  it(`default basemapId is "${DEFAULT_BASEMAP_ID}"`, () => {
    expect(useMapStore.getState().basemapId).toBe(DEFAULT_BASEMAP_ID);
  });

  it('setBasemap changes the basemapId', () => {
    useMapStore.getState().setBasemap('esri-world-imagery');
    expect(useMapStore.getState().basemapId).toBe('esri-world-imagery');
  });

  it('persist middleware saves to localStorage under key "comapeo-map"', () => {
    useMapStore.getState().setBasemap('osm-standard');

    const stored = localStorage.getItem('comapeo-map');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.basemapId).toBe('osm-standard');
  });

  it('setBasemap can be called multiple times', () => {
    useMapStore.getState().setBasemap('carto-dark-matter');
    expect(useMapStore.getState().basemapId).toBe('carto-dark-matter');

    useMapStore.getState().setBasemap('opentopomap');
    expect(useMapStore.getState().basemapId).toBe('opentopomap');
  });

  it('persisted data includes version number', () => {
    useMapStore.getState().setBasemap('osm-standard');

    const stored = localStorage.getItem('comapeo-map');
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
  });

  it('partialize excludes setBasemap from persisted state', () => {
    useMapStore.getState().setBasemap('osm-standard');

    const stored = localStorage.getItem('comapeo-map');
    const parsed = JSON.parse(stored!);
    // Only basemapId should be persisted, not the function
    expect(parsed.state).toEqual({ basemapId: 'osm-standard' });
  });
});

describe('map-store activeMapId', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    useMapStore.setState({ activeProjectLocalId: null, activeMapId: null });
  });

  it('default activeMapId is null', () => {
    expect(useMapStore.getState().activeMapId).toBeNull();
  });

  it('setActiveMap updates the cache and writes activeMapId to the project', async () => {
    const db = getDb();
    await db.projects.add({
      localId: 'proj-1',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    useMapStore.getState().setActiveMap('proj-1', 'map-1');

    // Cache updates synchronously.
    expect(useMapStore.getState().activeMapId).toBe('map-1');

    // The Dexie write is fire-and-forget; poll for it to settle.
    await vi.waitFor(async () => {
      const project = await db.projects.get('proj-1');
      expect(project?.activeMapId).toBe('map-1');
    });
  });

  it('setActiveMap with null clears activeMapId on the project', async () => {
    const db = getDb();
    await db.projects.add({
      localId: 'proj-2',
      sourceType: 'local',
      sourceId: 'local',
      activeMapId: 'map-old',
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    useMapStore.getState().setActiveMap('proj-2', null);
    expect(useMapStore.getState().activeMapId).toBeNull();

    await vi.waitFor(async () => {
      const project = await db.projects.get('proj-2');
      expect(project?.activeMapId).toBeNull();
    });
  });

  it('setActiveMap does not throw when projectLocalId does not exist', async () => {
    const db = getDb();
    expect(() =>
      useMapStore.getState().setActiveMap('does-not-exist', 'map-x'),
    ).not.toThrow();

    // No project row is created, and no existing row is mutated.
    expect(await db.projects.get('does-not-exist')).toBeUndefined();
  });

  it('hydrateActiveMap sets the cache only and does not write to Dexie', async () => {
    const db = getDb();
    await db.projects.add({
      localId: 'proj-3',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    useMapStore.getState().hydrateActiveMap('proj-3', 'map-h');
    expect(useMapStore.getState().activeMapId).toBe('map-h');
    expect(useMapStore.getState().activeProjectLocalId).toBe('proj-3');

    // Drain any stray microtasks; the project record must be untouched.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const project = await db.projects.get('proj-3');
    expect(project?.activeMapId).toBeUndefined();
  });

  it('round-trip: setActiveMap then re-hydrate yields the same value', async () => {
    const db = getDb();
    await db.projects.add({
      localId: 'proj-4',
      sourceType: 'local',
      sourceId: 'local',
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    useMapStore.getState().setActiveMap('proj-4', 'map-r');

    await vi.waitFor(async () => {
      expect((await db.projects.get('proj-4'))?.activeMapId).toBe('map-r');
    });

    // Simulate the hydration effect reading from Dexie and re-hydrating.
    useMapStore.setState({ activeMapId: null });
    const stored = (await db.projects.get('proj-4'))?.activeMapId ?? null;
    useMapStore.getState().hydrateActiveMap('proj-4', stored);

    expect(useMapStore.getState().activeMapId).toBe('map-r');
  });

  it('partialize excludes activeMapId from persisted state', () => {
    useMapStore.getState().hydrateActiveMap('proj-x', 'map-persist-check');

    const stored = localStorage.getItem('comapeo-map');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.state).not.toHaveProperty('activeMapId');
    expect(parsed.state).not.toHaveProperty('activeProjectLocalId');
  });

  it('a failed write does not roll back into a different project slot', async () => {
    // Repro for "rollback crosses project state": a write for project A fails
    // after the user has switched to project B. Both projects currently show
    // null, so a value-only rollback guard would restore project A's previous
    // selection into project B's slot. The project-aware guard must prevent it.
    const db = getDb();
    await db.projects.add({
      localId: 'proj-b',
      sourceType: 'local',
      sourceId: 'local',
      activeMapId: null,
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    // Store is representing project A with a persisted selection 'map-a'.
    useMapStore.getState().hydrateActiveMap('proj-a', 'map-a');
    expect(useMapStore.getState().activeMapId).toBe('map-a');

    // The Dexie update for the clear will reject.
    const updateSpy = vi
      .spyOn(db.projects, 'update')
      .mockRejectedValueOnce(new Error('idb rejected'));

    // User clears project A's selection; the optimistic cache updates.
    useMapStore.getState().setActiveMap('proj-a', null);
    expect(useMapStore.getState().activeMapId).toBeNull();

    // User switches to project B (whose persisted selection is also null)
    // before the failed write settles.
    useMapStore.getState().hydrateActiveMap('proj-b', null);

    // Drain the rejection + rollback microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    updateSpy.mockRestore();

    // Project A's failed clear must NOT bleed 'map-a' into project B's slot.
    expect(useMapStore.getState().activeProjectLocalId).toBe('proj-b');
    expect(useMapStore.getState().activeMapId).toBeNull();
  });
});
