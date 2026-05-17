import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(async () => {
  sessionStorage.clear();
  await resetDb();
  useAuthStore.setState({
    tier: 'local',
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
    isAuthenticated: false,
  });
});

afterEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Backward compat tests (old api-client consumers)
// ---------------------------------------------------------------------------

describe('backward compat — token/baseUrl/isAuthenticated', () => {
  it('initial state has no token and no baseUrl', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.baseUrl).toBeNull();
  });

  it('setToken updates state', () => {
    useAuthStore.getState().setToken('my-bearer-token');
    expect(useAuthStore.getState().token).toBe('my-bearer-token');
  });

  it('setBaseUrl updates state', () => {
    useAuthStore.getState().setBaseUrl('https://api.example.com');
    expect(useAuthStore.getState().baseUrl).toBe('https://api.example.com');
  });

  it('clearAuth resets to null state', () => {
    useAuthStore.getState().setToken('some-token');
    useAuthStore.getState().setBaseUrl('https://api.example.com');

    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.baseUrl).toBeNull();
  });

  it('isAuthenticated returns false in local tier', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tier-aware tests
// ---------------------------------------------------------------------------

describe('tier-aware connection store', () => {
  it('default tier is local', () => {
    expect(useAuthStore.getState().tier).toBe('local');
  });

  it('no token is required for app access', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.tier).toBe('local');
  });

  it('adds a remote archive server', async () => {
    await useAuthStore.getState().addServer({
      label: 'My Server',
      baseUrl: 'https://archive.example.com',
      token: 'my-token',
    });

    const state = useAuthStore.getState();
    expect(state.servers).toHaveLength(1);
    expect(state.servers[0]!.baseUrl).toBe('https://archive.example.com');
    expect(state.servers[0]!.token).toBe('my-token');
  });

  it('addServer returns the created server ID', async () => {
    const serverId = await useAuthStore.getState().addServer({
      label: 'Return Test',
      baseUrl: 'https://return.example.com',
      token: 'my-token',
    });

    const state = useAuthStore.getState();
    expect(serverId).toBe(state.servers[0]!.id);
  });

  it('removes a remote archive server', async () => {
    await useAuthStore.getState().addServer({
      label: 'To Remove',
      baseUrl: 'https://remove.example.com',
      token: 'tok',
    });

    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;

    await useAuthStore.getState().removeServer(id);

    expect(useAuthStore.getState().servers).toHaveLength(0);
  });

  it('removing the active server clears activeServerId and derived fields', async () => {
    await useAuthStore.getState().addServer({
      label: 'Active',
      baseUrl: 'https://active.example.com',
      token: 'tok',
    });
    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;
    useAuthStore.getState().setActiveServer(id);
    expect(useAuthStore.getState().activeServerId).toBe(id);

    await useAuthStore.getState().removeServer(id);
    const state = useAuthStore.getState();
    expect(state.servers).toHaveLength(0);
    expect(state.activeServerId).toBeNull();
    expect(state.token).toBeNull();
    expect(state.baseUrl).toBeNull();
  });

  it('sets active server and updates computed fields', async () => {
    await useAuthStore.getState().addServer({
      label: 'Active Test',
      baseUrl: 'https://active.example.com',
      token: 'active-token',
    });

    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;

    useAuthStore.getState().setActiveServer(id);

    const state = useAuthStore.getState();
    expect(state.activeServerId).toBe(id);
    expect(state.baseUrl).toBe('https://active.example.com');
    expect(state.token).toBe('active-token');
  });

  it('sets active server to null clears computed fields', async () => {
    await useAuthStore.getState().addServer({
      label: 'Test',
      baseUrl: 'https://test.example.com',
      token: 'test-token',
    });

    const { servers } = useAuthStore.getState();
    useAuthStore.getState().setActiveServer(servers[0]!.id);

    expect(useAuthStore.getState().baseUrl).toBe('https://test.example.com');

    useAuthStore.getState().setActiveServer(null);
    expect(useAuthStore.getState().baseUrl).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('updates server sync status', async () => {
    await useAuthStore.getState().addServer({
      label: 'Status Test',
      baseUrl: 'https://status.example.com',
      token: 'tok',
    });

    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;

    await useAuthStore.getState().updateServerStatus(id, 'connected');

    const updated = useAuthStore.getState().servers.find((s) => s.id === id);
    expect(updated?.status).toBe('connected');
    expect(updated?.lastSyncedAt).toBeDefined();

    await useAuthStore
      .getState()
      .updateServerStatus(id, 'error', 'Connection failed');

    const errored = useAuthStore.getState().servers.find((s) => s.id === id);
    expect(errored?.status).toBe('error');
    expect(errored?.errorMessage).toBe('Connection failed');
  });
});

// ---------------------------------------------------------------------------
// setTier
// ---------------------------------------------------------------------------

describe('setTier', () => {
  it('changes tier to remoteArchive', () => {
    useAuthStore.getState().setTier('remoteArchive');
    expect(useAuthStore.getState().tier).toBe('remoteArchive');
  });

  it('changes tier to cloud', () => {
    useAuthStore.getState().setTier('cloud');
    expect(useAuthStore.getState().tier).toBe('cloud');
  });

  it('changes tier back to local', () => {
    useAuthStore.getState().setTier('cloud');
    useAuthStore.getState().setTier('local');
    expect(useAuthStore.getState().tier).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe('clearAll', () => {
  it('resets everything to defaults', async () => {
    // Set up non-default state
    useAuthStore.getState().setTier('cloud');
    await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://example.com',
      token: 'tok',
    });
    const { servers } = useAuthStore.getState();
    useAuthStore.getState().setActiveServer(servers[0]!.id);

    // Verify state is non-default
    const before = useAuthStore.getState();
    expect(before.tier).toBe('cloud');
    expect(before.servers.length).toBeGreaterThan(0);
    expect(before.activeServerId).not.toBeNull();

    // Clear
    useAuthStore.getState().clearAll();

    const state = useAuthStore.getState();
    expect(state.tier).toBe('local');
    expect(state.servers).toEqual([]);
    expect(state.activeServerId).toBeNull();
    expect(state.token).toBeNull();
    expect(state.baseUrl).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setToken — backward-compat with activeServerId
// ---------------------------------------------------------------------------

describe('setToken — backward compat with active server', () => {
  it('updates the active server token when activeServerId is set', async () => {
    await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://example.com',
      token: 'old-token',
    });
    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;
    useAuthStore.getState().setActiveServer(id);

    useAuthStore.getState().setToken('new-token');

    const state = useAuthStore.getState();
    expect(state.token).toBe('new-token');
    const updated = state.servers.find((s) => s.id === id);
    expect(updated?.token).toBe('new-token');
  });

  it('sets token directly when no activeServerId', () => {
    expect(useAuthStore.getState().activeServerId).toBeNull();

    useAuthStore.getState().setToken('standalone-token');

    const state = useAuthStore.getState();
    expect(state.token).toBe('standalone-token');
    // No servers should be affected
    expect(state.servers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Server deduplication tests
// ---------------------------------------------------------------------------

describe('addServer deduplication', () => {
  it('returns existing server ID when adding a duplicate baseUrl', async () => {
    const id1 = await useAuthStore.getState().addServer({
      label: 'First',
      baseUrl: 'https://archive.example.com',
      token: 'token-1',
    });

    const id2 = await useAuthStore.getState().addServer({
      label: 'Second',
      baseUrl: 'https://archive.example.com',
      token: 'token-2',
    });

    // Same ID returned — no duplicate created
    expect(id2).toBe(id1);
    expect(useAuthStore.getState().servers).toHaveLength(1);
  });

  it('updates the token on the existing server when re-adding', async () => {
    await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://archive.example.com',
      token: 'old-token',
    });

    await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://archive.example.com',
      token: 'new-token',
    });

    const state = useAuthStore.getState();
    expect(state.servers).toHaveLength(1);
    expect(state.servers[0]!.token).toBe('new-token');
  });

  it('deduplicates URLs with trailing slashes', async () => {
    const id1 = await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://archive.example.com/',
      token: 'tok',
    });

    const id2 = await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://archive.example.com',
      token: 'tok',
    });

    expect(id2).toBe(id1);
    expect(useAuthStore.getState().servers).toHaveLength(1);
  });

  it('deduplicates URLs with different trailing slashes and case', async () => {
    const id1 = await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://Archive.Example.COM/api/',
      token: 'tok',
    });

    const id2 = await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://archive.example.com/api',
      token: 'tok',
    });

    expect(id2).toBe(id1);
    expect(useAuthStore.getState().servers).toHaveLength(1);
  });

  it('allows different baseUrls to coexist', async () => {
    await useAuthStore.getState().addServer({
      label: 'Server A',
      baseUrl: 'https://server-a.example.com',
      token: 'tok-a',
    });

    await useAuthStore.getState().addServer({
      label: 'Server B',
      baseUrl: 'https://server-b.example.com',
      token: 'tok-b',
    });

    expect(useAuthStore.getState().servers).toHaveLength(2);
  });

  it('deduplicates via invite URL and manual add', async () => {
    // Simulate adding via invite URL (InviteScreen path)
    const id1 = await useAuthStore.getState().addServer({
      label: 'archive.example.com',
      baseUrl: 'https://archive.example.com',
      token: 'invite-token',
    });

    // Simulate manual add via AddArchiveServerDialog
    const id2 = await useAuthStore.getState().addServer({
      label: 'Production Server',
      baseUrl: 'https://archive.example.com',
      token: 'manual-token',
    });

    expect(id2).toBe(id1);
    expect(useAuthStore.getState().servers).toHaveLength(1);
    expect(useAuthStore.getState().servers[0]!.token).toBe('manual-token');
  });
});

// ---------------------------------------------------------------------------
// setBaseUrl — backward-compat with activeServerId
// ---------------------------------------------------------------------------

describe('setBaseUrl — backward compat with active server', () => {
  it('updates the active server baseUrl when activeServerId is set', async () => {
    await useAuthStore.getState().addServer({
      label: 'Server',
      baseUrl: 'https://old.example.com',
      token: 'tok',
    });
    const { servers } = useAuthStore.getState();
    const id = servers[0]!.id;
    useAuthStore.getState().setActiveServer(id);

    useAuthStore.getState().setBaseUrl('https://new.example.com');

    const state = useAuthStore.getState();
    expect(state.baseUrl).toBe('https://new.example.com');
    const updated = state.servers.find((s) => s.id === id);
    expect(updated?.baseUrl).toBe('https://new.example.com');
  });

  it('sets baseUrl directly when no activeServerId', () => {
    expect(useAuthStore.getState().activeServerId).toBeNull();

    useAuthStore.getState().setBaseUrl('https://standalone.example.com');

    const state = useAuthStore.getState();
    expect(state.baseUrl).toBe('https://standalone.example.com');
    expect(state.servers).toEqual([]);
  });
});
