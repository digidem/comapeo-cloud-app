import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableStats {
  count: number;
}

export interface StorageStats {
  /** Total available storage in bytes (from navigator.storage.estimate) */
  quota: number;
  /** Total used storage in bytes (from navigator.storage.estimate) */
  usage: number;
  /** Usage as a percentage of quota (0-100) */
  usagePercent: number;
  /** Per-table record counts */
  tables: {
    projects: TableStats;
    observations: TableStats;
    alerts: TableStats;
    presets: TableStats;
    attachments: TableStats;
    remoteServers: TableStats;
    syncMetadata: TableStats;
  };
}

// ---------------------------------------------------------------------------
// getStorageStats
// ---------------------------------------------------------------------------

/**
 * Returns total storage usage/quota from the Storage API and per-table record
 * counts from the local Dexie database.
 */
export async function getStorageStats(): Promise<StorageStats> {
  let quota = 0;
  let usage = 0;

  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate) {
      quota = estimate.quota ?? 0;
      usage = estimate.usage ?? 0;
    }
  } catch {
    // navigator.storage.estimate() may throw in some environments
  }

  const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;

  const db = getDb();

  const [
    projects,
    observations,
    alerts,
    presets,
    attachments,
    remoteServers,
    syncMetadata,
  ] = await Promise.all([
    db.projects.count(),
    db.observations.count(),
    db.alerts.count(),
    db.presets.count(),
    db.attachments.count(),
    db.remoteServers.count(),
    db.syncMetadata.count(),
  ]);

  return {
    quota,
    usage,
    usagePercent,
    tables: {
      projects: { count: projects },
      observations: { count: observations },
      alerts: { count: alerts },
      presets: { count: presets },
      attachments: { count: attachments },
      remoteServers: { count: remoteServers },
      syncMetadata: { count: syncMetadata },
    },
  };
}

// ---------------------------------------------------------------------------
// clearAllData
// ---------------------------------------------------------------------------

/**
 * Clears ALL data from IndexedDB tables. Does not reload the page.
 * Useful for clearing cached data while keeping the app running.
 */
export async function clearAllData(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

// ---------------------------------------------------------------------------
// clearServerData
// ---------------------------------------------------------------------------

/**
 * Removes all records associated with a specific remote server,
 * including projects, observations, alerts, attachments, presets,
 * sync metadata, and the server record itself.
 */
export async function clearServerData(serverId: string): Promise<void> {
  const db = getDb();

  // Find all projects from this server
  const allProjects = await db.projects.toArray();
  const serverProjects = allProjects.filter((p) => p.sourceId === serverId);
  const projectIds = serverProjects.map((p) => p.localId);

  // Clear all related data per project
  await db.transaction('rw', db.tables, async () => {
    for (const project of serverProjects) {
      await db.projects.delete(project.localId);
    }
    for (const projectId of projectIds) {
      await db.observations.where('projectLocalId').equals(projectId).delete();
      await db.alerts.where('projectLocalId').equals(projectId).delete();
      await db.attachments.where('projectLocalId').equals(projectId).delete();
      await db.presets.where('projectLocalId').equals(projectId).delete();
    }
    await db.remoteServers.delete(serverId);
    await db.syncMetadata.where('serverId').equals(serverId).delete();
  });
}

// ---------------------------------------------------------------------------
// clearProjectData
// ---------------------------------------------------------------------------

/**
 * Removes a single project and all its related records
 * (observations, alerts, attachments, presets).
 */
export async function clearProjectData(projectLocalId: string): Promise<void> {
  const db = getDb();

  await db.transaction('rw', db.tables, async () => {
    await db.projects.delete(projectLocalId);
    await db.observations
      .where('projectLocalId')
      .equals(projectLocalId)
      .delete();
    await db.alerts.where('projectLocalId').equals(projectLocalId).delete();
    await db.attachments
      .where('projectLocalId')
      .equals(projectLocalId)
      .delete();
    await db.presets.where('projectLocalId').equals(projectLocalId).delete();
  });
}
