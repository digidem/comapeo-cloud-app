import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useProjectStore } from '@/stores/project-store';

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ selectedProjectId: null, selectedServerId: null });
});

afterEach(() => {
  localStorage.clear();
});

describe('project-store', () => {
  it('default selectedProjectId and selectedServerId are null', () => {
    expect(useProjectStore.getState().selectedProjectId).toBeNull();
    expect(useProjectStore.getState().selectedServerId).toBeNull();
  });

  it('setSelectedProjectId sets the project ID', () => {
    useProjectStore.getState().setSelectedProjectId('project-1');
    expect(useProjectStore.getState().selectedProjectId).toBe('project-1');
  });

  it('setSelectedProjectId(null) clears the project ID', () => {
    useProjectStore.getState().setSelectedProjectId('project-1');
    expect(useProjectStore.getState().selectedProjectId).toBe('project-1');

    useProjectStore.getState().setSelectedProjectId(null);
    expect(useProjectStore.getState().selectedProjectId).toBeNull();
  });

  it('setSelectedServerId sets the server ID', () => {
    useProjectStore.getState().setSelectedServerId('server-1');
    expect(useProjectStore.getState().selectedServerId).toBe('server-1');
  });

  it('setSelectedServerId(null) clears the server ID', () => {
    useProjectStore.getState().setSelectedServerId('server-1');
    expect(useProjectStore.getState().selectedServerId).toBe('server-1');

    useProjectStore.getState().setSelectedServerId(null);
    expect(useProjectStore.getState().selectedServerId).toBeNull();
  });

  it('setSelectedProjectId overwrites previous selection', () => {
    useProjectStore.getState().setSelectedProjectId('first');
    useProjectStore.getState().setSelectedProjectId('second');
    expect(useProjectStore.getState().selectedProjectId).toBe('second');
  });

  it('setSelectedServerId overwrites previous selection', () => {
    useProjectStore.getState().setSelectedServerId('first');
    useProjectStore.getState().setSelectedServerId('second');
    expect(useProjectStore.getState().selectedServerId).toBe('second');
  });

  it('persist middleware saves to localStorage under key "comapeo-project"', () => {
    useProjectStore.getState().setSelectedProjectId('persisted-project');
    useProjectStore.getState().setSelectedServerId('persisted-server');

    const stored = localStorage.getItem('comapeo-project');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.selectedProjectId).toBe('persisted-project');
    expect(parsed.state.selectedServerId).toBe('persisted-server');
  });
});
