import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArchiveStore } from '@/stores/archive-store';

beforeEach(() => {
  localStorage.clear();
  useArchiveStore.setState({ selectedArchiveId: null });
});

afterEach(() => {
  localStorage.clear();
});

describe('archive-store', () => {
  it('default selectedArchiveId is null', () => {
    expect(useArchiveStore.getState().selectedArchiveId).toBeNull();
  });

  it('selectArchive sets selectedArchiveId', () => {
    useArchiveStore.getState().selectArchive('archive-1');
    expect(useArchiveStore.getState().selectedArchiveId).toBe('archive-1');
  });

  it('selectArchive(null) clears selectedArchiveId', () => {
    useArchiveStore.getState().selectArchive('archive-1');
    expect(useArchiveStore.getState().selectedArchiveId).toBe('archive-1');

    useArchiveStore.getState().selectArchive(null);
    expect(useArchiveStore.getState().selectedArchiveId).toBeNull();
  });

  it('selectArchive overwrites previous selection', () => {
    useArchiveStore.getState().selectArchive('first');
    useArchiveStore.getState().selectArchive('second');
    expect(useArchiveStore.getState().selectedArchiveId).toBe('second');
  });

  it('persist middleware saves to localStorage under key "comapeo-archive"', () => {
    useArchiveStore.getState().selectArchive('persisted-archive');

    const stored = localStorage.getItem('comapeo-archive');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.selectedArchiveId).toBe('persisted-archive');
  });
});
