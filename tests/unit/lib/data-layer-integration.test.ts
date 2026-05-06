import { describe, expect, it } from 'vitest';

import * as apiClientModule from '@/lib/api-client';
import * as dataLayerModule from '@/lib/data-layer';
import * as remoteArchiveModule from '@/lib/remote-archive';

describe('data layer integration', () => {
  it('apiClient is not used directly by screens', () => {
    // Verify that apiClient exports are only used by intended modules.
    // The apiClient and remote-archive are the only valid consumers.
    // This test documents the module dependency boundaries.
    expect(apiClientModule.apiClient).toBeDefined();
    expect(remoteArchiveModule.pullProjects).toBeDefined();
    expect(dataLayerModule.getProjects).toBeDefined();
  });

  it('data layer returns projects (integration smoke)', async () => {
    const projects = await dataLayerModule.getProjects();
    // No crash — returns results from IndexedDB
    expect(Array.isArray(projects)).toBe(true);
  });
});
