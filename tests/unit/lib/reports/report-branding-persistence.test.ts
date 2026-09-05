import { server } from '@tests/mocks/node';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { createProject, getProjects, updateProject } from '@/lib/data-layer';
import { getDb, resetDb } from '@/lib/db';
import { pullProjects } from '@/lib/remote-archive';

beforeEach(async () => {
  await resetDb();
});

describe('report branding persistence', () => {
  it('persists project-scoped branding in IndexedDB independently from the project icon', async () => {
    const project = await createProject({ name: 'Forest Guardians' });
    await updateProject(project.localId, {
      reportBranding: {
        schemaVersion: 1,
        organizationName: 'Forest Guardians Association',
        revision: 1,
        updatedAt: '2026-09-04T12:00:00.000Z',
        logo: {
          versionId: 'logo-v1',
          data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
          contentType: 'image/png',
          width: 128,
          height: 64,
          byteLength: 4,
          sha256: 'a'.repeat(64),
        },
      },
    });

    const stored = (await getProjects()).find(
      (candidate) => candidate.localId === project.localId,
    );
    expect(stored?.reportBranding?.organizationName).toBe(
      'Forest Guardians Association',
    );
    expect(stored?.reportBranding?.logo?.versionId).toBe('logo-v1');
    expect(stored?.iconRef).toBeUndefined();
  });

  it('preserves local report branding when a remote project refreshes', async () => {
    const baseUrl = 'https://archive.example.com';
    const localId = `remoteArchive:${baseUrl}:proj-1`;
    const db = getDb();
    await db.projects.put({
      localId,
      sourceType: 'remoteArchive',
      sourceId: 'server-1',
      remoteId: 'proj-1',
      name: 'Old Name',
      reportBranding: {
        schemaVersion: 1,
        organizationName: 'Forest Guardians Association',
        revision: 2,
        updatedAt: '2026-09-04T12:00:00.000Z',
      },
      createdAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
      dirtyLocal: false,
      deleted: false,
    });

    server.use(
      http.get(`${baseUrl}/projects`, () =>
        HttpResponse.json({
          data: [{ projectId: 'proj-1', name: 'New Name' }],
        }),
      ),
      http.get(`${baseUrl}/projects/proj-1`, () =>
        HttpResponse.json({
          data: { projectId: 'proj-1', name: 'New Name' },
        }),
      ),
    );

    await pullProjects('server-1', {
      baseUrl,
      token: ['unit', 'test'].join('-'),
    });

    const after = await db.projects.get(localId);
    expect(after?.name).toBe('New Name');
    expect(after?.reportBranding).toMatchObject({
      organizationName: 'Forest Guardians Association',
      revision: 2,
    });
  });
});
