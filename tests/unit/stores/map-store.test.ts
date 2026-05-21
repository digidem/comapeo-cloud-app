import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
