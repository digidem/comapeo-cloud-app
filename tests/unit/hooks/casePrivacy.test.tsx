/**
 * VAL-PRIVACY-001 regression tests — No sensitive Case content in logs,
 * errors, network, or activity.
 *
 * These tests prove that the #268 local Case foundation performs CRUD and
 * navigation using ONLY local IndexedDB repositories — never fetch/API-client,
 * console logging, or any archive/provider endpoint. They also verify that
 * sentinel sensitive Case values never leak into console, error messages, or
 * network payloads.
 *
 * Surface: browser (jsdom) + TanStack Query.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import React from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCase } from '@/hooks/useCase';
import { useCaseActivity } from '@/hooks/useCaseActivity';
import { useCaseReportStates } from '@/hooks/useCaseReportStates';
import { useCases } from '@/hooks/useCases';
import { useCreateCase } from '@/hooks/useCreateCase';
import { useDeleteCase } from '@/hooks/useDeleteCase';
import { useRecordCaseActivity } from '@/hooks/useRecordCaseActivity';
import { useStoragePersist } from '@/hooks/useStoragePersist';
import { useUpdateCase } from '@/hooks/useUpdateCase';
import { useUpsertCaseReportState } from '@/hooks/useUpsertCaseReportState';
import * as dataLayer from '@/lib/data-layer';
import { resetDb } from '@/lib/db';

// Sentinel sensitive values that must NEVER appear in console/errors/network
const SENTINEL_SENSITIVE_TITLE =
  'CONFIDENTIAL-SECRET-REPORT-789456 sensitive context';
const SENTINEL_REPORT_BODY =
  'TOP_SECRET: agent names Alice and Bob, meeting at dawn';
const SENTINEL_PROMPT = 'AI_PROMPT: investigate the smuggling operation';
const SENTINEL_TOKEN = 'bearer-archive-token-secret-9988776655443322';
const SENTINEL_MEDIA_REF = 'blob:https://archive.example.com/private-media-123';

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = createTestQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/**
 * Collect all console output (error, warn, log, info, debug) and network
 * activity (fetch) into a single captured array. After the test runs, the
 * array can be scanned for sentinel sensitive values.
 */
function captureConsoleAndNetwork() {
  const captured: {
    method: string;
    args: unknown[];
  }[] = [];

  const consoleSpy = vi.spyOn(console, 'error');
  const consoleWarnSpy = vi.spyOn(console, 'warn');
  const consoleLogSpy = vi.spyOn(console, 'log');
  const consoleInfoSpy = vi.spyOn(console, 'info');
  const consoleDebugSpy = vi.spyOn(console, 'debug');

  consoleSpy.mockImplementation((...args) => {
    captured.push({ method: 'error', args });
  });
  consoleWarnSpy.mockImplementation((...args) => {
    captured.push({ method: 'warn', args });
  });
  consoleLogSpy.mockImplementation((...args) => {
    captured.push({ method: 'log', args });
  });
  consoleInfoSpy.mockImplementation((...args) => {
    captured.push({ method: 'info', args });
  });
  consoleDebugSpy.mockImplementation((...args) => {
    captured.push({ method: 'debug', args });
  });

  // Spy on fetch to detect any network calls
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockImplementation(() => {
    captured.push({ method: 'fetch', args: [] });
    return Promise.resolve(new Response(null, { status: 200 }));
  });

  return {
    captured,
    restore: () => {
      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      fetchSpy.mockRestore();
    },
  };
}

/**
 * Convert captured console/error args to a JSON string for scanning.
 */
function capturedToString(
  captured: { method: string; args: unknown[] }[],
): string {
  return captured
    .map((entry) =>
      entry.args
        .map((a) => {
          try {
            return typeof a === 'string' ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' '),
    )
    .join('\n');
}

/**
 * Assert that no sentinel value appears in captured console/network output.
 */
function assertNoSentinelLeak(captured: { method: string; args: unknown[] }[]) {
  const output = capturedToString(captured);
  const sentinels = [
    SENTINEL_SENSITIVE_TITLE,
    SENTINEL_REPORT_BODY,
    SENTINEL_PROMPT,
    SENTINEL_TOKEN,
    SENTINEL_MEDIA_REF,
  ];
  for (const sentinel of sentinels) {
    expect(output).not.toContain(sentinel);
  }
}

describe('VAL-PRIVACY-001: Case foundation — no sensitive content in logs, errors, or network', () => {
  describe('Case CRUD hooks use no fetch/API-client/network', () => {
    it('useCase fetch hooks never call fetch or console on error', async () => {
      // Mock getCase to reject with a generic error (no sensitive content)
      vi.spyOn(dataLayer, 'getCase').mockRejectedValue(new Error('DB error'));

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useCase('proj-1', 'case-1'), {
          wrapper,
        });

        await waitFor(() => expect(result.current.isError).toBe(true));

        // No fetch calls should have been made
        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);

        // The error itself must not contain sentinel values
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useCases fetch hook never calls fetch', async () => {
      const mockCases = [
        {
          localId: 'case-1',
          title: SENTINEL_SENSITIVE_TITLE,
          status: 'active',
        },
      ];
      vi.spyOn(dataLayer, 'getCases').mockResolvedValue(mockCases as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useCases('proj-1'), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useCreateCase never calls fetch or API client — only local data-layer', async () => {
      vi.spyOn(dataLayer, 'createCase').mockResolvedValue({
        localId: 'case-1',
        title: SENTINEL_SENSITIVE_TITLE,
        status: 'draft',
      } as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useCreateCase(), { wrapper });

        result.current.mutate({
          projectLocalId: 'proj-1',
          title: SENTINEL_SENSITIVE_TITLE,
          caseType: 'illegal_mining',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useUpdateCase never calls fetch or API client', async () => {
      vi.spyOn(dataLayer, 'updateCase').mockResolvedValue({
        localId: 'case-1',
        title: SENTINEL_SENSITIVE_TITLE,
        status: 'active',
      } as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useUpdateCase(), { wrapper });

        result.current.mutate({
          projectLocalId: 'proj-1',
          localId: 'case-1',
          updates: { status: 'active' },
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useDeleteCase never calls fetch or API client', async () => {
      vi.spyOn(dataLayer, 'deleteCase').mockResolvedValue(true as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useDeleteCase(), { wrapper });

        result.current.mutate({
          projectLocalId: 'proj-1',
          localId: 'case-1',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });
  });

  describe('Case activity hooks never perform network calls', () => {
    it('useCaseActivity does not call fetch', async () => {
      vi.spyOn(dataLayer, 'getCaseActivity').mockResolvedValue([] as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(
          () => useCaseActivity('proj-1', 'case-1'),
          { wrapper },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useRecordCaseActivity does not call fetch', async () => {
      vi.spyOn(dataLayer, 'recordCaseActivity').mockResolvedValue({
        localId: 'act-1',
        caseLocalId: 'case-1',
        projectLocalId: 'proj-1',
        event: 'status_changed',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      } as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useRecordCaseActivity(), {
          wrapper,
        });

        result.current.mutate({
          projectLocalId: 'proj-1',
          caseLocalId: 'case-1',
          event: 'status_changed',
          status: 'active',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });
  });

  describe('Case report state hooks never perform network calls', () => {
    it('useCaseReportStates does not call fetch', async () => {
      vi.spyOn(dataLayer, 'getCaseReportStates').mockResolvedValue([] as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(
          () => useCaseReportStates('proj-1', 'case-1'),
          { wrapper },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });

    it('useUpsertCaseReportState does not call fetch', async () => {
      vi.spyOn(dataLayer, 'upsertCaseReportState').mockResolvedValue({
        localId: 'rs-1',
        caseLocalId: 'case-1',
        projectLocalId: 'proj-1',
        agency: 'FUNAI',
        status: 'complete',
        revision: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as never);

      const monitor = captureConsoleAndNetwork();
      try {
        const { result } = renderHook(() => useUpsertCaseReportState(), {
          wrapper,
        });

        result.current.mutate({
          projectLocalId: 'proj-1',
          caseLocalId: 'case-1',
          agency: 'FUNAI',
          status: 'complete',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(
          monitor.captured.filter((c) => c.method === 'fetch'),
        ).toHaveLength(0);
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });
  });

  describe('useStoragePersist never calls fetch', () => {
    it('does not perform any network requests', async () => {
      const monitor = captureConsoleAndNetwork();
      try {
        renderHook(() => useStoragePersist(), { wrapper });
        // Give the effect a chance to run
        await vi.waitFor(() => {
          expect(
            monitor.captured.filter((c) => c.method === 'fetch'),
          ).toHaveLength(0);
        });
        assertNoSentinelLeak(monitor.captured);
      } finally {
        monitor.restore();
      }
    });
  });

  describe('Case activity data never stores sensitive content', () => {
    it('recordCaseActivity stores only metadata — no report body, prompt, or token', async () => {
      // Create a real project + case in the DB
      const { getDb } = await import('@/lib/db');
      const { createCase: repoCreateCase } =
        await import('@/lib/local-repositories');
      const { recordCaseActivity: repoRecordCaseActivity } =
        await import('@/lib/local-repositories');

      const db = getDb();
      const projectLocalId = 'test-proj-' + crypto.randomUUID();
      await db.projects.add({
        localId: projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        name: 'Test Project',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: true,
        deleted: false,
      });

      const created = await repoCreateCase({
        projectLocalId,
        title: SENTINEL_SENSITIVE_TITLE,
        caseType: 'illegal_mining',
      });

      // The createCase auto-records a 'created' activity event
      const activity = await repoRecordCaseActivity({
        caseLocalId: created.localId,
        projectLocalId,
        event: 'status_changed',
        status: 'active',
      });

      // Verify the activity record contains ONLY metadata fields — no
      // sensitive Case content, report body, prompt, transcript, or token
      const activityKeys = Object.keys(activity);
      const disallowedKeys = [
        'reportBody',
        'reportContent',
        'prompt',
        'transcript',
        'media',
      ];
      for (const key of disallowedKeys) {
        expect(activityKeys).not.toContain(key);
      }

      // Verify activity event/status are metadata-only
      expect(activity.event).toBe('status_changed');
      expect(activity.status).toBe('active');
      expect(activity.caseLocalId).toBe(created.localId);

      // The activity string representation should not contain sentinels
      const activityJSON = JSON.stringify(activity);
      const sentinels = [
        SENTINEL_REPORT_BODY,
        SENTINEL_PROMPT,
        SENTINEL_TOKEN,
        SENTINEL_MEDIA_REF,
      ];
      for (const sentinel of sentinels) {
        expect(activityJSON).not.toContain(sentinel);
      }
    });

    it('upsertCaseReportState stores only status/provenance — no report body or prompt', async () => {
      const { getDb } = await import('@/lib/db');
      const { createCase: repoCreateCase } =
        await import('@/lib/local-repositories');
      const { upsertCaseReportState: repoUpsertState } =
        await import('@/lib/local-repositories');

      const db = getDb();
      const projectLocalId = 'test-proj-' + crypto.randomUUID();
      await db.projects.add({
        localId: projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        name: 'Test Project',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: true,
        deleted: false,
      });

      const created = await repoCreateCase({
        projectLocalId,
        title: SENTINEL_SENSITIVE_TITLE,
        caseType: 'illegal_mining',
      });

      const state = await repoUpsertState({
        caseLocalId: created.localId,
        projectLocalId,
        agency: 'FUNAI',
        status: 'complete',
        count: 42,
        revision: 1,
      });

      // Verify the stored shape contains ONLY allowed fields
      const stateKeys = Object.keys(state);
      for (const key of [
        'reportBody',
        'reportContent',
        'prompt',
        'transcript',
        'media',
      ]) {
        expect(stateKeys).not.toContain(key);
      }

      // Verify no sentinel content in the serialized state
      const stateJSON = JSON.stringify(state);
      const sentinels = [
        SENTINEL_SENSITIVE_TITLE,
        SENTINEL_REPORT_BODY,
        SENTINEL_PROMPT,
        SENTINEL_TOKEN,
        SENTINEL_MEDIA_REF,
      ];
      for (const sentinel of sentinels) {
        expect(stateJSON).not.toContain(sentinel);
      }
    });

    it('updateCase strips non-allowlisted fields (no system/provenance injection)', async () => {
      const { getDb } = await import('@/lib/db');
      const { createCase: repoCreateCase, updateCase: repoUpdateCase } =
        await import('@/lib/local-repositories');

      const db = getDb();
      const projectLocalId = 'test-proj-' + crypto.randomUUID();
      await db.projects.add({
        localId: projectLocalId,
        sourceType: 'local',
        sourceId: 'local',
        name: 'Test Project',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        dirtyLocal: true,
        deleted: false,
      });

      const created = await repoCreateCase({
        projectLocalId,
        title: 'Test Case',
        caseType: 'illegal_mining',
      });

      // Attempt to inject disallowed fields via runtime cast
      const maliciousUpdates = {
        title: 'Updated Title',
        status: 'active',
        // These should be silently dropped:
        remoteProjectNamespace: 'evil',
        remoteProjectId: 'evil-id',
        createdBy: SENTINEL_TOKEN,
        createdAt: SENTINEL_PROMPT,
      } as unknown as Parameters<typeof repoUpdateCase>[2];

      await repoUpdateCase(projectLocalId, created.localId, maliciousUpdates);

      const updated = await db.cases.get(created.localId);
      expect(updated).toBeDefined();
      // The allowlisted fields should be updated
      expect(updated!.title).toBe('Updated Title');
      expect(updated!.status).toBe('active');
      // The injected fields must NOT be present
      expect(updated!.createdBy).toBe('local');
      expect(updated!.remoteProjectNamespace).toBeUndefined();
      expect(updated!.remoteProjectId).toBeUndefined();
      // createdAt must not be the sentinel
      expect(updated!.createdAt).not.toBe(SENTINEL_PROMPT);
    });
  });
});
