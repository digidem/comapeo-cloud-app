import { describe, expect, it } from 'vitest';

import type { Project } from '@/lib/db';
import {
  REPORT_BRANDING_LOGO_MAX_BYTES,
  REPORT_BRANDING_LOGO_MAX_DIMENSION,
  createReportBrandingLogoAsset,
  createReportBrandingSnapshot,
  normalizeOrganizationName,
  resolveProjectReportBranding,
} from '@/lib/reports/report-branding';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    localId: 'project-1',
    sourceType: 'local',
    sourceId: 'local',
    name: 'Forest Guardians',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
    ...overrides,
  };
}

function pngBytes(extraBytes = 0): ArrayBuffer {
  const bytes = new Uint8Array(8 + extraBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes.buffer;
}

describe('report branding contract', () => {
  it('normalizes an explicit organization name without changing its meaning', () => {
    expect(
      normalizeOrganizationName('  Associac\u0327a\u0303o Guardio\u0303es  '),
    ).toBe('Associação Guardiões');
  });

  it('rejects a blank organization name', () => {
    expect(() => normalizeOrganizationName('   ')).toThrow(
      'Organization name is required',
    );
  });

  it('defaults unsaved branding to the current project name', () => {
    expect(resolveProjectReportBranding(makeProject())).toEqual({
      schemaVersion: 1,
      organizationName: 'Forest Guardians',
      revision: 0,
      updatedAt: undefined,
      logo: undefined,
    });
  });

  it('falls back to Untitled Project when the project name is blank', () => {
    expect(
      resolveProjectReportBranding(makeProject({ name: '   ' }))
        .organizationName,
    ).toBe('Untitled Project');
  });

  it('never reuses the project icon as the report logo', () => {
    const project = makeProject({
      iconRef: {
        docId: 'project-icon',
        contentType: 'image/png',
      },
    });

    expect(resolveProjectReportBranding(project).logo).toBeUndefined();
  });

  it('creates a versioned logo asset only when bytes match an allowed image type', async () => {
    const logo = await createReportBrandingLogoAsset({
      data: pngBytes(),
      contentType: 'image/png',
      width: 512,
      height: 256,
      versionId: 'logo-v1',
    });

    expect(logo).toMatchObject({
      versionId: 'logo-v1',
      contentType: 'image/png',
      width: 512,
      height: 256,
      byteLength: 8,
    });
    expect(logo.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects MIME spoofing, SVG, oversized bytes, and oversized decoded dimensions', async () => {
    await expect(
      createReportBrandingLogoAsset({
        data: pngBytes(),
        contentType: 'image/jpeg',
        width: 100,
        height: 100,
        versionId: 'spoofed',
      }),
    ).rejects.toThrow('does not match');

    await expect(
      createReportBrandingLogoAsset({
        data: new TextEncoder().encode('<svg></svg>').buffer,
        contentType: 'image/svg+xml' as 'image/png',
        width: 100,
        height: 100,
        versionId: 'svg',
      }),
    ).rejects.toThrow('PNG, JPEG, or WebP');

    await expect(
      createReportBrandingLogoAsset({
        data: pngBytes(REPORT_BRANDING_LOGO_MAX_BYTES),
        contentType: 'image/png',
        width: 100,
        height: 100,
        versionId: 'too-large',
      }),
    ).rejects.toThrow('2 MB');

    await expect(
      createReportBrandingLogoAsset({
        data: pngBytes(),
        contentType: 'image/png',
        width: REPORT_BRANDING_LOGO_MAX_DIMENSION + 1,
        height: 100,
        versionId: 'too-wide',
      }),
    ).rejects.toThrow('2048');
  });

  it('creates an immutable-by-copy branding snapshot with exact logo provenance', async () => {
    const logo = await createReportBrandingLogoAsset({
      data: pngBytes(),
      contentType: 'image/png',
      width: 512,
      height: 256,
      versionId: 'logo-v1',
    });
    const project = makeProject({
      reportBranding: {
        schemaVersion: 1,
        organizationName: 'Forest Guardians Association',
        revision: 4,
        updatedAt: '2026-09-04T10:00:00.000Z',
        logo,
      },
    });

    const snapshot = createReportBrandingSnapshot(project);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      projectLocalId: 'project-1',
      organizationName: 'Forest Guardians Association',
      brandingRevision: 4,
      logo: {
        versionId: 'logo-v1',
        sha256: logo.sha256,
        contentType: 'image/png',
        width: 512,
        height: 256,
      },
    });
    expect(snapshot.logo?.data).not.toBe(logo.data);

    new Uint8Array(logo.data)[0] = 0;
    expect(new Uint8Array(snapshot.logo!.data)[0]).toBe(0x89);
  });
});
