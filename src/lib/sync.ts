import { getRemoteServer } from '@/lib/local-repositories';
import {
  deriveAttachmentsFromObservations,
  pullAlerts,
  pullFields,
  pullObservations,
  pullPresets,
  pullProjects,
  pullTracks,
} from '@/lib/remote-archive';
import { useAuthStore } from '@/stores/auth-store';

export interface SyncOptions {
  baseUrl: string;
  token: string;
  serverLabel?: string;
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Per-server concurrency lock
// ---------------------------------------------------------------------------

const activeSyncs = new Map<string, Promise<SyncResult>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureServerInStore(
  options: SyncOptions,
): Promise<string | null> {
  // Always call addServer — it handles deduplication by baseUrl and
  // updates the token when it has changed, keeping the auth store in
  // sync with the credentials used for the current sync operation.
  const id = await useAuthStore.getState().addServer({
    label: options.serverLabel ?? options.baseUrl,
    baseUrl: options.baseUrl,
    token: options.token,
    allowDuplicate: true,
  });
  return id;
}

async function doSync(
  serverDbId: string,
  options: SyncOptions,
): Promise<SyncResult> {
  try {
    // Ensure server is in the auth store so sync status tracking works
    await ensureServerInStore(options);

    const serverRecord = await getRemoteServer(serverDbId);
    if (!serverRecord) {
      return {
        success: false,
        error: `Server ${serverDbId} not found in database`,
      };
    }

    // Update server status to syncing
    await useAuthStore.getState().updateServerStatus(serverDbId, 'syncing');

    const config = { baseUrl: options.baseUrl, token: options.token };

    // Pull projects
    const projects = await pullProjects(serverDbId, config);

    // Pull observations, alerts, and presets for each project.
    // Each data type is handled independently so a single failure does not
    // abort the others — partial results are still persisted.
    //
    // Critical failures (observations): these are required for a project to
    // be considered synced. If observations fail, the project is marked as
    // failed but does not abort other projects.
    //
    // Non-critical failures (alerts, presets): these are logged as warnings
    // but do NOT cause the project or overall sync to fail.
    const projectWarnings: string[] = [];
    const projectResults = await Promise.allSettled(
      projects.map(async (project) => {
        if (project.remoteId) {
          const projectErrors: string[] = [];
          let observationsOk = false;

          try {
            await pullObservations(
              serverDbId,
              project.remoteId,
              project.localId,
              config,
            );
            observationsOk = true;
          } catch (e) {
            projectErrors.push(
              `Observations: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          // Alerts are non-critical — log warnings, don't fail
          try {
            await pullAlerts(
              serverDbId,
              project.remoteId,
              project.localId,
              config,
            );
          } catch (e) {
            const msg = `Alerts: ${e instanceof Error ? e.message : String(e)}`;
            projectWarnings.push(
              `${project.name ?? project.remoteId ?? 'project'}: ${msg}`,
            );
          }

          // Presets are non-critical — log warnings, don't fail
          try {
            await pullPresets(
              serverDbId,
              project.remoteId,
              project.localId,
              config,
            );
          } catch (e) {
            const msg = `Presets: ${e instanceof Error ? e.message : String(e)}`;
            projectWarnings.push(
              `${project.name ?? project.remoteId ?? 'project'}: ${msg}`,
            );
          }

          // Tracks are non-critical — log warnings, don't fail
          try {
            await pullTracks(
              serverDbId,
              project.remoteId,
              project.localId,
              config,
            );
          } catch (e) {
            const msg = `Tracks: ${e instanceof Error ? e.message : String(e)}`;
            projectWarnings.push(
              `${project.name ?? project.remoteId ?? 'project'}: ${msg}`,
            );
          }

          // Fields are non-critical — log warnings, don't fail
          try {
            await pullFields(
              serverDbId,
              project.remoteId,
              project.localId,
              config,
            );
          } catch (e) {
            const msg = `Fields: ${e instanceof Error ? e.message : String(e)}`;
            projectWarnings.push(
              `${project.name ?? project.remoteId ?? 'project'}: ${msg}`,
            );
          }

          // Derive attachment records from observation data
          // Non-critical — individual attachment failures produce warnings
          if (observationsOk) {
            try {
              await deriveAttachmentsFromObservations(
                serverDbId,
                project.remoteId,
                project.localId,
                config,
              );
            } catch (e) {
              const msg = `Attachments: ${e instanceof Error ? e.message : String(e)}`;
              projectWarnings.push(
                `${project.name ?? project.remoteId ?? 'project'}: ${msg}`,
              );
            }
          }

          // Only fail the project if observations (critical) failed
          if (projectErrors.length > 0) {
            throw new Error(projectErrors.join('; '));
          }

          // Track warning: observations synced but secondary data failed
          if (observationsOk && projectWarnings.length > 0) {
            // warnings already pushed above
          }
        }
      }),
    );

    // Collect critical project errors (observations failures)
    const projectErrors = projectResults
      .map((r, i) => ({ r, i }))
      .filter(
        (x): x is { r: PromiseRejectedResult; i: number } =>
          x.r.status === 'rejected',
      )
      .map(({ r, i }) => {
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        const name =
          projects[i]?.name ?? projects[i]?.remoteId ?? `project ${i}`;
        return `${name}: ${reason}`;
      });

    // Filter warnings to only those from projects that actually succeeded
    // (warnings from failed projects are already covered by projectErrors)
    if (projectErrors.length > 0) {
      // Some projects had critical failures — but other projects may have
      // synced successfully. If at least one project succeeded, don't fail
      // the entire sync; just report partial failure.
      const succeededCount = projects.length - projectErrors.length;

      if (succeededCount > 0) {
        // Partial success: some projects synced, some didn't
        const errorMsg = `Partial sync — ${succeededCount}/${projects.length} projects synced. Errors: ${projectErrors.join('; ')}`;
        const statusMsg =
          projectWarnings.length > 0
            ? `${errorMsg} (warnings: ${projectWarnings.join('; ')})`
            : errorMsg;
        await useAuthStore
          .getState()
          .updateServerStatus(serverDbId, 'connected', statusMsg);
        return { success: true, error: undefined };
      }

      // Complete failure: no projects synced successfully
      const errorMsg = projectErrors.join('; ');
      await useAuthStore
        .getState()
        .updateServerStatus(serverDbId, 'error', errorMsg);
      return { success: false, error: errorMsg };
    }

    // All projects synced observations successfully
    if (projectWarnings.length > 0) {
      await useAuthStore
        .getState()
        .updateServerStatus(
          serverDbId,
          'connected',
          `Synced with warnings: ${projectWarnings.join('; ')}`,
        );
      return { success: true };
    }

    // Perfect sync — no errors or warnings
    await useAuthStore.getState().updateServerStatus(serverDbId, 'connected');

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown sync error';
    // Update server status to error — use serverDbId directly
    await useAuthStore
      .getState()
      .updateServerStatus(serverDbId, 'error', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Public API — sync with concurrency guard
// ---------------------------------------------------------------------------

export async function syncRemoteArchive(
  serverDbId: string,
  options: SyncOptions,
): Promise<SyncResult> {
  // Check the lock BEFORE any side effects (ensureServerInStore, status updates)
  const existingSync = activeSyncs.get(serverDbId);
  if (existingSync) {
    return {
      success: false,
      error: 'Sync already in progress',
    };
  }

  const syncPromise = doSync(serverDbId, options).finally(() => {
    activeSyncs.delete(serverDbId);
  });

  activeSyncs.set(serverDbId, syncPromise);

  return syncPromise;
}
