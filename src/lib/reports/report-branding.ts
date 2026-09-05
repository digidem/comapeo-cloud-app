import type {
  Project,
  ReportBranding,
  ReportBrandingLogoAsset,
  ReportBrandingLogoContentType,
} from '@/lib/db';

export const REPORT_BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const REPORT_BRANDING_LOGO_MAX_DIMENSION = 2048;

export type ReportBrandingValidationCode =
  | 'organization-name-required'
  | 'logo-type-unsupported'
  | 'logo-too-large'
  | 'logo-dimensions-invalid'
  | 'logo-dimensions-too-large'
  | 'logo-mime-mismatch'
  | 'logo-version-required'
  | 'sha256-unavailable';

export class ReportBrandingValidationError extends Error {
  readonly code: ReportBrandingValidationCode;

  constructor(code: ReportBrandingValidationCode, message: string) {
    super(message);
    this.name = 'ReportBrandingValidationError';
    this.code = code;
  }
}

const ALLOWED_CONTENT_TYPES = new Set<ReportBrandingLogoContentType>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export interface CreateReportBrandingLogoAssetInput {
  data: ArrayBuffer;
  contentType: ReportBrandingLogoContentType;
  width: number;
  height: number;
  versionId: string;
}

export interface ReportBrandingSnapshotLogo {
  versionId: string;
  data: ArrayBuffer;
  contentType: ReportBrandingLogoContentType;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
}

export interface ReportBrandingSnapshot {
  schemaVersion: 1;
  projectLocalId: string;
  organizationName: string;
  brandingRevision: number;
  logo?: ReportBrandingSnapshotLogo;
}

export function normalizeOrganizationName(value: string): string {
  const normalized = value.trim().normalize('NFC');
  if (!normalized) {
    throw new ReportBrandingValidationError(
      'organization-name-required',
      'Organization name is required',
    );
  }
  return normalized;
}

function cloneLogo(logo: ReportBrandingLogoAsset): ReportBrandingLogoAsset {
  return {
    ...logo,
    data: logo.data.slice(0),
  };
}

export function resolveProjectReportBranding(project: Project): ReportBranding {
  if (project.reportBranding) {
    return {
      ...project.reportBranding,
      organizationName: normalizeOrganizationName(
        project.reportBranding.organizationName,
      ),
      logo: project.reportBranding.logo
        ? cloneLogo(project.reportBranding.logo)
        : undefined,
    };
  }

  return {
    schemaVersion: 1,
    organizationName: normalizeOrganizationName(
      project.name ?? 'Untitled Project',
    ),
    revision: 0,
    updatedAt: undefined,
    logo: undefined,
  };
}

function bytesMatch(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function sniffImageContentType(
  data: ArrayBuffer,
): ReportBrandingLogoContentType | undefined {
  const bytes = new Uint8Array(data);
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return undefined;
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ReportBrandingValidationError(
      'logo-dimensions-invalid',
      'Logo dimensions must be positive whole pixels',
    );
  }
  if (
    width > REPORT_BRANDING_LOGO_MAX_DIMENSION ||
    height > REPORT_BRANDING_LOGO_MAX_DIMENSION
  ) {
    throw new ReportBrandingValidationError(
      'logo-dimensions-too-large',
      `Logo dimensions must not exceed ${REPORT_BRANDING_LOGO_MAX_DIMENSION}×${REPORT_BRANDING_LOGO_MAX_DIMENSION}`,
    );
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function sha256(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ReportBrandingValidationError(
      'sha256-unavailable',
      'SHA-256 is unavailable in this browser',
    );
  }
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', data));
}

export async function createReportBrandingLogoAsset({
  data,
  contentType,
  width,
  height,
  versionId,
}: CreateReportBrandingLogoAssetInput): Promise<ReportBrandingLogoAsset> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ReportBrandingValidationError(
      'logo-type-unsupported',
      'Logo must be PNG, JPEG, or WebP',
    );
  }
  if (data.byteLength > REPORT_BRANDING_LOGO_MAX_BYTES) {
    throw new ReportBrandingValidationError(
      'logo-too-large',
      'Logo must be 2 MB or smaller',
    );
  }
  validateDimensions(width, height);

  const detectedContentType = sniffImageContentType(data);
  if (!detectedContentType) {
    throw new ReportBrandingValidationError(
      'logo-type-unsupported',
      'Logo must be PNG, JPEG, or WebP',
    );
  }
  if (detectedContentType !== contentType) {
    throw new ReportBrandingValidationError(
      'logo-mime-mismatch',
      'Declared logo content type does not match image bytes',
    );
  }

  const normalizedVersionId = versionId.trim();
  if (!normalizedVersionId) {
    throw new ReportBrandingValidationError(
      'logo-version-required',
      'Logo version ID is required',
    );
  }

  const ownedData = data.slice(0);
  return {
    versionId: normalizedVersionId,
    data: ownedData,
    contentType,
    width,
    height,
    byteLength: ownedData.byteLength,
    sha256: await sha256(ownedData),
  };
}

export function createReportBrandingSnapshot(
  project: Project,
): ReportBrandingSnapshot {
  const branding = resolveProjectReportBranding(project);
  return {
    schemaVersion: 1,
    projectLocalId: project.localId,
    organizationName: branding.organizationName,
    brandingRevision: branding.revision,
    logo: branding.logo
      ? {
          ...branding.logo,
          data: branding.logo.data.slice(0),
        }
      : undefined,
  };
}
