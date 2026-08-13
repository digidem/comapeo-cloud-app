import { getDb } from '@/lib/db';

export async function getProjectSavedMapIds(
  projectLocalId: string,
): Promise<string[]> {
  const maps = await getDb()
    .maps.where('projectLocalId')
    .equals(projectLocalId)
    .toArray();
  return maps.map((map) => map.id);
}

/**
 * Bring a surviving map back to the same coherent state used by a normal
 * download cancellation. This is needed when destructive cleanup aborts an
 * in-flight download but the subsequent deletion fails.
 */
export async function recoverCancelledMapDownload(
  mapId: string,
): Promise<void> {
  const db = getDb();
  const updates = {
    status: 'draft' as const,
    errorMessage: undefined,
    updatedAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.maps.update(mapId, updates);
      return;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}
