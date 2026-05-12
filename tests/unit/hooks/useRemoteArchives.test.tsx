import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useRemoteArchives } from '@/hooks/useRemoteArchives';
import { getDb, resetDb } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetDb();
  useAuthStore.setState({
    tier: 'local',
    servers: [],
    activeServerId: null,
  });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('useRemoteArchives', () => {
  it('returns empty archives when no projects exist', async () => {
    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    // Wait for react-query to settle
    await waitFor(() => {
      expect(result.current.archives).toEqual([]);
    });
    expect(result.current.selectedArchiveId).toBeNull();
    expect(result.current.localProjects).toEqual([]);
  });

  it('returns selectedArchiveId and selectArchive from archive-store', async () => {
    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      expect(result.current.archives).toEqual([]);
    });

    expect(result.current.selectedArchiveId).toBeNull();

    result.current.selectArchive('test-archive');

    const { result: result2 } = renderHook(() => useRemoteArchives(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result2.current.selectedArchiveId).toBe('test-archive');
    });
  });

  it('local archive is pinned first in archives list', async () => {
    const db = getDb();

    await db.projects.add({
      localId: 'local-proj',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Local Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    await db.projects.add({
      localId: 'remote-proj',
      sourceType: 'remote',
      sourceId: 'remote',
      name: 'Remote Project',
      serverUrl: 'https://archive.example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      const archives = result.current.archives;
      expect(archives.length).toBeGreaterThan(0);
    });

    const archives = result.current.archives;
    expect(archives).toHaveLength(2);

    // Local archive first (pinned)
    expect(archives[0]?.archiveId).toBe('_local');
    expect(archives[0]?.name).toBe('Local');
    expect(archives[0]?.url).toBeNull();
    expect(archives[0]?.projectCount).toBe(1);

    // Remote archive second
    expect(archives[1]?.archiveId).toBe('https://archive.example.com');
    expect(archives[1]?.url).toBe('https://archive.example.com');
    expect(archives[1]?.projectCount).toBe(1);

    expect(result.current.localProjects).toHaveLength(1);
    expect(result.current.localProjects[0]?.localId).toBe('local-proj');
  });

  it('uses server label from auth store when available', async () => {
    useAuthStore.getState().addServer({
      label: 'My Archive',
      baseUrl: 'https://archive.example.com',
      token: 'test-token',
    });

    const db = getDb();

    await db.projects.add({
      localId: 'remote-proj-2',
      sourceType: 'remote',
      sourceId: 'remote',
      name: 'Remote Project',
      serverUrl: 'https://archive.example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      const archives = result.current.archives;
      expect(archives.length).toBeGreaterThan(0);
    });

    const archives = result.current.archives;
    const remoteArchive = archives.find(
      (a: { archiveId: string }) => a.archiveId !== '_local',
    );
    expect(remoteArchive?.name).toBe('My Archive');
  });

  it('falls back to hostname when no matching server label exists', async () => {
    const db = getDb();

    // Add a local project so the _local group exists
    await db.projects.add({
      localId: 'local-proj-fallback',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Local Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    await db.projects.add({
      localId: 'remote-proj-3',
      sourceType: 'remote',
      sourceId: 'remote',
      name: 'Remote Project',
      serverUrl: 'https://some-remote-server.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      const archives = result.current.archives;
      expect(archives.length).toBeGreaterThan(0);
    });

    const archives = result.current.archives;
    // Should have '_local' and one remote
    expect(archives).toHaveLength(2);
    const remoteArchive = archives.find(
      (a: { archiveId: string }) => a.archiveId !== '_local',
    );
    expect(remoteArchive?.name).toBe('some-remote-server.com');
  });

  it('shows server-only archives even when no projects are synced yet', async () => {
    // Add a server to the auth store without any projects in the DB
    await useAuthStore.getState().addServer({
      label: 'Just Connected',
      baseUrl: 'https://just-added.example.com',
      token: 'fresh-token',
    });

    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      expect(result.current.archives.length).toBeGreaterThan(0);
    });

    const archives = result.current.archives;
    const serverArchive = archives.find(
      (a) => a.archiveId === 'https://just-added.example.com',
    );
    expect(serverArchive).toBeDefined();
    expect(serverArchive!.name).toBe('Just Connected');
    expect(serverArchive!.projectCount).toBe(0);
    expect(serverArchive!.url).toBe('https://just-added.example.com');
  });

  it('sorts remote archives alphabetically by name', async () => {
    const db = getDb();

    // Add a local project so the _local group exists and is pinned first
    await db.projects.add({
      localId: 'local-proj-sort',
      sourceType: 'local',
      sourceId: 'local',
      name: 'Local Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    await db.projects.add({
      localId: 'z-proj',
      sourceType: 'remote',
      sourceId: 'z',
      name: 'Z Project',
      serverUrl: 'https://zzz.archive.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    await db.projects.add({
      localId: 'a-proj',
      sourceType: 'remote',
      sourceId: 'a',
      name: 'A Project',
      serverUrl: 'https://aaa.archive.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirtyLocal: false,
      deleted: false,
    });

    const { result } = renderHook(() => useRemoteArchives(), { wrapper });

    await waitFor(() => {
      const archives = result.current.archives;
      expect(archives.length).toBeGreaterThan(1);
    });

    const archives = result.current.archives;
    // First should be _local (pinned), then aaa, then zzz
    expect(archives[0]?.archiveId).toBe('_local');

    // aaa and zzz sorted alphabetically by hostname
    const remoteNames = archives
      .filter((a: { archiveId: string }) => a.archiveId !== '_local')
      .map((a: { name: string }) => a.name);
    expect(remoteNames).toEqual(['aaa.archive.com', 'zzz.archive.com']);
  });
});
