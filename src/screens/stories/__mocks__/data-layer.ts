/**
 * Mock for data-layer functions used by screens.
 *
 * Storybook fixtures (kept empty so stories render empty states
 * cleanly; fill in if a specific story needs a non-empty data set).
 */

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

export async function deleteProject(_localId: string): Promise<void> {
  throw new Error('Mock: deleteProject not implemented for Storybook');
}

export async function syncRemoteArchive(
  _serverId: string,
  _config: { baseUrl: string; token: string },
): Promise<{ success: boolean }> {
  return { success: true };
}
