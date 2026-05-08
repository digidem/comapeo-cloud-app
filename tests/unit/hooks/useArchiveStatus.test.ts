import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useAuthStore } from '@/stores/auth-store';

const setState = useAuthStore.setState;

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
});
