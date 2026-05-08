import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { resetDb } from '@/lib/db';
import { createRemoteServer } from '@/lib/local-repositories';
import { useAuthStore } from '@/stores/auth-store';

const setState = useAuthStore.setState;

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  useAuthStore.setState({ servers: [] });
});

describe('useArchiveStatus', () => {
  it('returns empty servers when none configured', () => {
    setState({ servers: [] });
    const { result } = renderHook(() => useArchiveStatus());
    expect(result.current.servers).toEqual([]);
    expect(result.current.anyError).toBe(false);
    expect(result.current.anySyncing).toBe(false);
  });

  it('maps idle server correctly', () => {
    setState({
      servers: [
        {
          id: 's1',
          label: 'Main',
          baseUrl: 'http://a.com',
          token: 'tok',
          status: 'idle',
        },
      ],
    });
    const { result } = renderHook(() => useArchiveStatus());
    expect(result.current.servers[0]).toMatchObject({
      id: 's1',
      isSyncing: false,
      error: null,
      hasCredentials: true,
    });
  });

  it('marks isSyncing true for syncing server', () => {
    setState({
      servers: [
        {
          id: 's1',
          label: 'X',
          baseUrl: 'http://b.com',
          token: 'tok',
          status: 'syncing',
        },
      ],
    });
    const { result } = renderHook(() => useArchiveStatus());
    expect(result.current.servers[0]?.isSyncing).toBe(true);
    expect(result.current.anySyncing).toBe(true);
  });

  it('maps error server and sets anyError', () => {
    setState({
      servers: [
        {
          id: 's1',
          label: 'X',
          baseUrl: 'http://c.com',
          token: 'tok',
          status: 'error',
          errorMessage: 'timeout',
        },
      ],
    });
    const { result } = renderHook(() => useArchiveStatus());
    expect(result.current.servers[0]?.error).toBe('timeout');
    expect(result.current.anyError).toBe(true);
  });

  it('hasCredentials false when token empty', () => {
    setState({
      servers: [
        {
          id: 's1',
          label: 'X',
          baseUrl: 'http://d.com',
          token: '',
          status: 'idle',
        },
      ],
    });
    const { result } = renderHook(() => useArchiveStatus());
    expect(result.current.servers[0]?.hasCredentials).toBe(false);
  });

  it('includes cached servers without credentials after reload', async () => {
    const cached = await createRemoteServer({
      baseUrl: 'http://archive.test',
      label: 'Archive Test',
    });

    const { result } = renderHook(() => useArchiveStatus());

    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1);
    });
    expect(result.current.servers[0]).toMatchObject({
      id: cached.id,
      label: 'Archive Test',
      baseUrl: 'http://archive.test',
      hasCredentials: false,
    });
  });
});
