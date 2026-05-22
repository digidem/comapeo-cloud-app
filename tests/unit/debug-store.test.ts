import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/stores/project-store';

describe('debug-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useProjectStore.setState({
      selectedProjectId: null,
      selectedServerId: null,
    });
  });

  it('setState persists values before render', () => {
    expect(useProjectStore.getState().selectedProjectId).toBeNull();

    useProjectStore.setState({ selectedProjectId: 'p1' });

    expect(useProjectStore.getState().selectedProjectId).toBe('p1');
  });
});
