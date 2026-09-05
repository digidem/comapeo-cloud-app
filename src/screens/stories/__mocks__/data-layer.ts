/**
 * Mock for data-layer functions used by screens.
 *
 * Storybook fixtures (kept empty so stories render empty states
 * cleanly; fill in if a specific story needs a non-empty data set).
 */

// ---------------------------------------------------------------------------
// Re-export Case types so screens importing them from '@/lib/data-layer'
// resolve to the mock alias in Storybook.
// ---------------------------------------------------------------------------
export type Case = {
  localId: string;
  projectLocalId: string;
  title: string;
  caseType:
    | 'invasion_occupation'
    | 'territorial_encroachment'
    | 'deforestation_logging'
    | 'illegal_mining'
    | 'fire'
    | 'wildlife_exploitation'
    | 'pollution_contamination'
    | 'threats_violence'
    | 'rights_violation'
    | 'other';
  status: 'draft' | 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  revision: number;
  createdBy: string;
  deleted: boolean;
  remoteProjectNamespace?: string;
  remoteProjectId?: string;
};

export type CaseStatus = 'draft' | 'active' | 'closed';
export type CaseType =
  | 'invasion_occupation'
  | 'territorial_encroachment'
  | 'deforestation_logging'
  | 'illegal_mining'
  | 'fire'
  | 'wildlife_exploitation'
  | 'pollution_contamination'
  | 'threats_violence'
  | 'rights_violation'
  | 'other';
export type CaseAgency = 'FUNAI' | 'IBAMA' | 'MPF' | 'PF';
export type CaseActivityEvent =
  | 'created'
  | 'status_changed'
  | 'reopened'
  | 'report_state_changed'
  | 'evidence_added'
  | 'evidence_removed'
  | 'media_inclusion_changed'
  | 'disclosure_changed'
  | 'deleted';
export type CaseActivity = {
  localId: string;
  caseLocalId: string;
  projectLocalId: string;
  event: CaseActivityEvent;
  status?: CaseStatus;
  agency?: CaseAgency;
  count?: number;
  createdAt: string;
};
export type CaseReportState = {
  localId: string;
  caseLocalId: string;
  projectLocalId: string;
  agency: CaseAgency;
  status: 'incomplete' | 'complete' | 'error';
  count?: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

// `never[]` is assignable to any `T[]`, so empty arrays work as flexible
// fixtures without needing an explicit element type.
export async function getAttachmentsForProject(
  _projectLocalId: string,
): Promise<never[]> {
  return [];
}

export async function getTracks(_projectLocalId: string): Promise<never[]> {
  return [];
}

export async function getFields(_projectLocalId: string): Promise<never[]> {
  return [];
}

export async function getAlerts(_projectLocalId: string): Promise<never[]> {
  return [];
}

export async function getObservations(
  _projectLocalId: string,
): Promise<never[]> {
  return [];
}

export async function addCaseEvidence(_input: unknown) {
  return { localId: 'storybook-case-evidence' };
}

export async function getCaseEvidence(
  _projectLocalId: string,
  _caseLocalId: string,
): Promise<never[]> {
  return [];
}

export async function getCaseEvidenceCounts(
  _projectLocalId: string,
): Promise<Record<string, number>> {
  return {};
}

export async function removeCaseEvidence(_input: unknown): Promise<boolean> {
  return true;
}

export async function getCaseEvidenceAttachments(
  _projectLocalId: string,
  _caseLocalId: string,
): Promise<never[]> {
  return [];
}

export async function setCaseEvidenceAttachmentSelected(_input: unknown) {
  return null;
}

export async function getCaseReportDisclosure(
  projectLocalId: string,
  caseLocalId: string,
  agency: CaseAgency,
) {
  return {
    caseLocalId,
    projectLocalId,
    agency,
    reporterIdentity: 'omit' as const,
    locationMode: 'omit' as const,
    people: [],
    media: [],
    sensitiveFields: [],
    revision: 0,
  };
}

export async function upsertCaseReportDisclosure(input: {
  projectLocalId: string;
  caseLocalId: string;
  agency: CaseAgency;
  disclosure: {
    reporterIdentity: 'include' | 'omit';
    locationMode: 'exact' | 'area' | 'omit';
    people: unknown[];
    media: unknown[];
    sensitiveFields: unknown[];
  };
}) {
  return {
    localId: 'storybook-case-disclosure',
    caseLocalId: input.caseLocalId,
    projectLocalId: input.projectLocalId,
    agency: input.agency,
    ...input.disclosure,
    revision: 1,
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T10:30:00Z',
  };
}

export async function getProjectPoints(_projectLocalId: string) {
  return { type: 'FeatureCollection' as const, features: [] };
}

export async function getPresets(_projectLocalId: string): Promise<never[]> {
  return [];
}

export async function importGeoJsonPoints(
  _input: unknown,
): Promise<{ imported: number; skipped: number }> {
  return { imported: 0, skipped: 0 };
}

export async function createProject(
  _input: unknown,
): Promise<{ projectId: string }> {
  throw new Error('Mock: createProject not implemented for Storybook');
}

export async function updateProject(
  _localId: string,
  _input: unknown,
): Promise<void> {
  throw new Error('Mock: updateProject not implemented for Storybook');
}

export async function deleteProject(_localId: string): Promise<string[]> {
  throw new Error('Mock: deleteProject not implemented for Storybook');
}

export async function syncRemoteArchive(
  _serverId: string,
  _config: { baseUrl: string; token: string },
): Promise<{ success: boolean }> {
  return { success: true };
}
