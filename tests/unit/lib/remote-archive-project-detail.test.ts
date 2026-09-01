import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, resetDb } from '@/lib/db';
import { pullProjectsDetailed } from '@/lib/remote-archive';

const config = {
  baseUrl: 'https://archive.example.com',
  token: 'test-token',
};

const localIdFor = (projectId: string) =>
  `remoteArchive:https://archive.example.com:${projectId}`;

const DETAIL_UNSUPPORTED_WARNING =
  'Project detail endpoint not supported by server — using basic project info';

function mockProjectList(projectIds: string[]): void {
  server.use(
    http.get(`${config.baseUrl}/projects`, () =>
      HttpResponse.json({
        data: projectIds.map((projectId) => ({
          projectId,
          name: `Project ${projectId}`,
        })),
      }),
    ),
  );
}

function mockDetailNotFound(counter?: { value: number }): void {
  server.use(
    http.get(`${config.baseUrl}/projects/:projectId`, () => {
      if (counter) counter.value += 1;
      return HttpResponse.json(
        {
          message: 'Route GET:/projects/:projectId not found',
          error: 'Not Found',
          statusCode: 404,
        },
        { status: 404 },
      );
    }),
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});

describe('pullProjectsDetailed project detail fetches', () => {
  it('emits one unsupported-endpoint warning and skips remaining detail fetches when a listed project 404s', async () => {
    const projectIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    mockProjectList(projectIds);
    const requests = { value: 0 };
    mockDetailNotFound(requests);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pullProjectsDetailed('server-1', config, {
      concurrency: 2,
    });

    expect(result.rows).toHaveLength(projectIds.length);
    expect(result.rows.map((project) => project.name)).toEqual(
      projectIds.map((projectId) => `Project ${projectId}`),
    );
    expect(result.warnings).toEqual([DETAIL_UNSUPPORTED_WARNING]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(DETAIL_UNSUPPORTED_WARNING);
    // Short-circuit: with concurrency 2 the first two in-flight detail
    // requests are all that can be issued before the flag flips.
    expect(requests.value).toBeLessThanOrEqual(2);
  });

  it('degrades to the same basic-info row shape as the rejected path when details 404', async () => {
    mockProjectList(['p1']);
    await getDb().projects.put({
      localId: localIdFor('p1'),
      remoteId: 'p1',
      name: 'Project p1',
      description: 'Local description',
      iconRef: { docId: 'icon-1' },
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      serverUrl: config.baseUrl,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });
    // Bare 404 with no body — classify404's default branch labels this
    // 'unsupported-endpoint', which is what licenses the short-circuit.
    server.use(
      http.get(
        `${config.baseUrl}/projects/p1`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const result = await pullProjectsDetailed('server-1', config);

    expect(result.warnings).toEqual([DETAIL_UNSUPPORTED_WARNING]);
    const stored = await getDb().projects.get(localIdFor('p1'));
    expect(stored).toMatchObject({
      remoteId: 'p1',
      name: 'Project p1',
      description: 'Local description',
      iconRef: { docId: 'icon-1' },
      deleted: false,
      dirtyLocal: false,
    });
  });

  it('still reports per-project warnings for non-404 detail failures', async () => {
    mockProjectList(['p1', 'p2']);
    server.use(
      http.get(`${config.baseUrl}/projects/:projectId`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pullProjectsDetailed('server-1', config);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('Failed to fetch details for project');
    expect(result.warnings[1]).toContain('Failed to fetch details for project');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(result.rows.map((project) => project.remoteId).sort()).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('keeps the per-project warning when a listed project 404s as PROJECT_NOT_FOUND', async () => {
    const projectIds = ['p1', 'p2', 'p3', 'p4'];
    mockProjectList(projectIds);
    const successfulDetails = { value: 0 };
    server.use(
      http.get(`${config.baseUrl}/projects/p1`, () =>
        HttpResponse.json(
          { message: 'project not found', statusCode: 404 },
          { status: 404 },
        ),
      ),
      http.get(`${config.baseUrl}/projects/:projectId`, ({ params }) => {
        successfulDetails.value += 1;
        const projectId = String(params.projectId);
        return HttpResponse.json({
          data: {
            projectId,
            name: `Project ${projectId}`,
            description: `Detail for ${projectId}`,
          },
        });
      }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pullProjectsDetailed('server-1', config);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      'Failed to fetch details for project p1',
    );
    expect(result.warnings).not.toContain(DETAIL_UNSUPPORTED_WARNING);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // A missing project is not an unsupported endpoint, so the remaining
    // detail fetches must not be short-circuited.
    expect(successfulDetails.value).toBe(3);
    expect(result.rows).toHaveLength(projectIds.length);
    for (const projectId of ['p2', 'p3', 'p4']) {
      expect(await getDb().projects.get(localIdFor(projectId))).toMatchObject({
        remoteId: projectId,
        description: `Detail for ${projectId}`,
      });
    }
    expect(
      (await getDb().projects.get(localIdFor('p1')))?.description,
    ).toBeUndefined();
  });

  it('short-circuits the unsupported 404 while keeping the per-project warning for a sibling failure', async () => {
    const projectIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    mockProjectList(projectIds);
    const requests = { value: 0 };
    server.use(
      http.get(`${config.baseUrl}/projects/p1`, async () => {
        requests.value += 1;
        // Settle after p2 so p2's unsupported 404 flips the flag before any
        // freed worker picks up p3 — otherwise the next fetch is an in-flight
        // race, not the short-circuit.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom' } },
          { status: 500 },
        );
      }),
      http.get(`${config.baseUrl}/projects/p2`, () => {
        requests.value += 1;
        return HttpResponse.json(
          { message: 'Route GET:/projects/:projectId not found' },
          { status: 404 },
        );
      }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pullProjectsDetailed('server-1', config, {
      concurrency: 2,
    });

    expect(result.warnings).toEqual([
      expect.stringContaining('Failed to fetch details for project p1'),
      DETAIL_UNSUPPORTED_WARNING,
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    // Only p1 (500) and p2 (route-shaped 404) are issued; p3+ short-circuit.
    expect(requests.value).toBe(2);
    expect(result.rows).toHaveLength(projectIds.length);
    for (const projectId of ['p1', 'p2']) {
      expect(await getDb().projects.get(localIdFor(projectId))).toMatchObject({
        remoteId: projectId,
        deleted: false,
        dirtyLocal: false,
      });
    }
  });

  it('rejects the pull when a detail fetch is aborted instead of storing degraded rows', async () => {
    mockProjectList(['p1']);
    const controller = new AbortController();
    let detailRequestStarted = false;
    server.use(
      http.get(`${config.baseUrl}/projects/p1`, async ({ request }) => {
        detailRequestStarted = true;
        await new Promise((resolve) => {
          request.signal.addEventListener('abort', resolve, { once: true });
        });
        return HttpResponse.error();
      }),
    );

    const pull = pullProjectsDetailed('server-1', {
      ...config,
      signal: controller.signal,
    });
    // Abort only once the detail request is in flight, so this exercises the
    // detail fetch path rather than aborting the list request.
    await vi.waitFor(() => expect(detailRequestStarted).toBe(true));
    controller.abort();

    await expect(pull).rejects.toThrow();
    expect(await getDb().projects.get(localIdFor('p1'))).toBeUndefined();
  });

  it('stores description and iconRef when the detail endpoint succeeds', async () => {
    mockProjectList(['p1']);
    server.use(
      http.get(`${config.baseUrl}/projects/p1`, () =>
        HttpResponse.json({
          data: {
            projectId: 'p1',
            name: 'Project p1',
            description: 'Server description',
            iconRef: { docId: 'icon-9' },
          },
        }),
      ),
    );

    const result = await pullProjectsDetailed('server-1', config);

    expect(result.warnings).toEqual([]);
    const stored = await getDb().projects.get(localIdFor('p1'));
    expect(stored).toMatchObject({
      description: 'Server description',
      iconRef: { docId: 'icon-9' },
    });
  });
});
