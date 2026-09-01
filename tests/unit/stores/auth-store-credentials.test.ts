import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import * as localRepositories from '@/lib/local-repositories';
import { selectActiveToken, useAuthStore } from '@/stores/auth-store';

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetDb();
  useAuthStore.setState({
    tier: 'local',
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
    isAuthenticated: false,
    hasHydratedServers: false,
  });
  vi.restoreAllMocks();
});

describe('runtime-only archive credentials', () => {
  it('keeps addServer credentials in memory while persisting metadata only', async () => {
    const id = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-one',
    });

    const runtime = useAuthStore
      .getState()
      .servers.find((server) => server.id === id);
    expect(runtime?.token).toBe('runtime-one');

    const persisted = (await getDb().remoteServers.get(id)) as unknown as
      Record<string, unknown> | undefined;
    expect(persisted).toMatchObject({
      id,
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
    });
    expect(persisted).not.toHaveProperty('token');
  });

  it('replaces duplicate credentials in memory without changing persisted metadata shape', async () => {
    const id = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-one',
    });

    const sameId = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-two',
      allowDuplicate: true,
    });

    expect(sameId).toBe(id);
    expect(useAuthStore.getState().servers[0]?.token).toBe('runtime-two');
    const persisted = (await getDb().remoteServers.get(id)) as unknown as
      Record<string, unknown> | undefined;
    expect(persisted).not.toHaveProperty('token');
  });

  it('hydrates persisted archives locked and marks hydration complete only after success', async () => {
    await getDb().remoteServers.add({
      id: 'persisted-server',
      baseUrl: 'https://persisted.example.com',
      label: 'Persisted',
      status: 'connected',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    });
    localStorage.setItem('comapeo:activeServerId', 'persisted-server');

    await useAuthStore.getState().hydrateServers();

    const state = useAuthStore.getState();
    expect(state.hasHydratedServers).toBe(true);
    expect(state.activeServerId).toBe('persisted-server');
    expect(state.baseUrl).toBe('https://persisted.example.com');
    expect(state.token).toBeNull();
    expect(state.servers[0]?.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('preserves an already-unlocked runtime credential across repeated hydration', async () => {
    const id = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-one',
    });
    useAuthStore.getState().setActiveServer(id);

    await useAuthStore.getState().hydrateServers();
    await useAuthStore.getState().hydrateServers();

    expect(useAuthStore.getState().servers[0]?.token).toBe('runtime-one');
    expect(selectActiveToken(useAuthStore.getState())).toBe('runtime-one');
  });

  it('drops an unlocked runtime credential when persisted metadata changes the server URL for the same id', async () => {
    const id = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-one',
    });
    useAuthStore.getState().setActiveServer(id);

    await getDb().remoteServers.update(id, {
      baseUrl: 'https://replacement.example.com',
    });
    await useAuthStore.getState().hydrateServers();

    const state = useAuthStore.getState();
    expect(state.servers[0]?.baseUrl).toBe('https://replacement.example.com');
    expect(state.servers[0]?.token).toBeNull();
    expect(selectActiveToken(state)).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('preserves runtime state and keeps hydration incomplete when metadata read fails', async () => {
    useAuthStore.setState({
      servers: [
        {
          id: 'runtime-server',
          label: 'Runtime',
          baseUrl: 'https://runtime.example.com',
          token: 'runtime-one',
          status: 'connected',
        },
      ],
      activeServerId: 'runtime-server',
      token: 'runtime-one',
      baseUrl: 'https://runtime.example.com',
      isAuthenticated: true,
      hasHydratedServers: false,
    });
    vi.spyOn(localRepositories, 'getRemoteServers').mockRejectedValue(
      new Error('metadata read failed'),
    );

    await useAuthStore.getState().hydrateServers();

    const state = useAuthStore.getState();
    expect(state.hasHydratedServers).toBe(false);
    expect(state.servers[0]?.token).toBe('runtime-one');
    expect(state.activeServerId).toBe('runtime-server');
    expect(state.isAuthenticated).toBe(true);
  });

  it('setToken rotates only runtime state and never writes a credential field', async () => {
    const id = await useAuthStore.getState().addServer({
      label: 'Archive',
      baseUrl: 'https://archive.example.com',
      token: 'runtime-one',
    });
    useAuthStore.getState().setActiveServer(id);

    await useAuthStore.getState().setToken('runtime-two');

    expect(selectActiveToken(useAuthStore.getState())).toBe('runtime-two');
    const persisted = (await getDb().remoteServers.get(id)) as unknown as
      Record<string, unknown> | undefined;
    expect(persisted).not.toHaveProperty('token');
  });
});
