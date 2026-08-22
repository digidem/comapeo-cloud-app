import Dexie from 'dexie';

import { isZeroZeroCoord } from '@/lib/coords';
import { getDb } from '@/lib/db';
import type {
  Alert,
  Attachment,
  Case,
  CaseActivity,
  CaseAgency,
  CaseReportState,
  CaseStatus,
  Field,
  Observation,
  Preset,
  Project,
  RemoteServer,
  SyncMetadata,
  Track,
} from '@/lib/db';
import { DbError, wrapDb } from '@/lib/db-error';
import { uuid } from '@/lib/uuid';

export { DbError } from '@/lib/db-error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString();
}

function localMeta() {
  return {
    sourceType: 'local' as const,
    sourceId: 'local' as const,
    dirtyLocal: true,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    deleted: false,
  };
}

type ImmutableFields = 'localId' | 'sourceType' | 'sourceId' | 'createdAt';
export type ProjectUpdates = Omit<Partial<Project>, ImmutableFields>;
export type ObservationUpdates = Omit<Partial<Observation>, ImmutableFields>;
export type AlertUpdates = Omit<Partial<Alert>, ImmutableFields>;
export type TrackUpdates = Omit<Partial<Track>, ImmutableFields>;
export type FieldUpdates = Omit<Partial<Field>, ImmutableFields>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  name?: string;
  description?: string;
  serverUrl?: string;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  return wrapDb(async () => {
    const db = getDb();
    const project: Project = {
      localId: uuid(),
      ...localMeta(),
      ...input,
    };
    await db.projects.add(project);
    return project;
  });
}

export async function getProjects(): Promise<Project[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.projects.filter((p) => !p.deleted).toArray();
  });
}

export async function getProject(
  localId: string,
): Promise<Project | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.projects.get(localId);
  });
}

export async function updateProject(
  localId: string,
  updates: ProjectUpdates,
): Promise<Project | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.projects.update(localId, { ...updates, updatedAt: timestamp() });
    return db.projects.get(localId);
  });
}

export async function deleteProject(localId: string): Promise<string[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.transaction(
      'rw',
      [
        db.projects,
        db.observations,
        db.alerts,
        db.attachments,
        db.tracks,
        db.fields,
        db.presets,
        db.maps,
        db.mapPackages,
        db.mapPackageChunks,
        db.cases,
        db.caseActivity,
        db.caseReportState,
      ],
      async () => {
        const removedMaps = await db.maps
          .where('projectLocalId')
          .equals(localId)
          .toArray();
        const removedMapIds = removedMaps.map((map) => map.id);
        const removedMapIdSet = new Set(removedMapIds);

        await db.observations.where('projectLocalId').equals(localId).delete();
        await db.alerts.where('projectLocalId').equals(localId).delete();
        await db.attachments.where('projectLocalId').equals(localId).delete();
        await db.tracks.where('projectLocalId').equals(localId).delete();
        await db.fields.where('projectLocalId').equals(localId).delete();
        await db.presets.where('projectLocalId').equals(localId).delete();
        if (removedMapIds.length > 0) {
          await db.mapPackageChunks
            .where('mapId')
            .anyOf(removedMapIds)
            .delete();
          await db.mapPackages.bulkDelete(removedMapIds);
        }
        await db.maps.where('projectLocalId').equals(localId).delete();

        // Case-owned rows cascade only for this project's cases. This is a
        // local-only cascade: no remote Case tombstones/sync (#275).
        const caseLocalIds = await db.cases
          .where('projectLocalId')
          .equals(localId)
          .primaryKeys();
        if (caseLocalIds.length > 0) {
          await db.caseActivity
            .where('caseLocalId')
            .anyOf(caseLocalIds)
            .delete();
          await db.caseReportState
            .where('caseLocalId')
            .anyOf(caseLocalIds)
            .delete();
        }
        await db.cases.where('projectLocalId').equals(localId).delete();

        if (removedMapIdSet.size > 0) {
          const updatedAt = timestamp();
          await db.projects
            .filter(
              (project) =>
                project.localId !== localId &&
                project.activeMapId !== null &&
                project.activeMapId !== undefined &&
                removedMapIdSet.has(project.activeMapId),
            )
            .modify((project) => {
              project.activeMapId = null;
              project.updatedAt = updatedAt;
            });
        }

        await db.projects.delete(localId);
        return removedMapIds;
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export interface CreateObservationInput {
  projectLocalId: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}

export async function createObservation(
  input: CreateObservationInput,
): Promise<Observation> {
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const observation: Observation = {
      localId: uuid(),
      projectLocalId: input.projectLocalId,
      ...localMeta(),
      tags: input.tags ?? {},
      lat: input.lat,
      lon: input.lon,
    };
    await db.observations.add(observation);
    return observation;
  });
}

export async function getObservations(
  projectLocalId: string,
): Promise<Observation[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.observations
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((o) => !o.deleted)
      .filter((o) => !isZeroZeroCoord(o.lat, o.lon))
      .toArray();
  });
}

export async function getObservation(
  localId: string,
): Promise<Observation | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    const observation = await db.observations.get(localId);
    return observation;
  });
}

export async function updateObservation(
  localId: string,
  updates: ObservationUpdates,
): Promise<Observation | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.observations.update(localId, {
      ...updates,
      updatedAt: timestamp(),
    });
    return db.observations.get(localId);
  });
}

export async function deleteObservation(localId: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.transaction('rw', [db.observations, db.attachments], async () => {
      await db.attachments.where('observationLocalId').equals(localId).delete();
      await db.observations.delete(localId);
    });
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface CreateAlertInput {
  projectLocalId: string;
  geometry?: { type: string; coordinates: unknown };
  metadata?: Record<string, unknown>;
  detectionDateStart?: string;
  detectionDateEnd?: string;
  sourceId?: string;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const alert: Alert = {
      localId: uuid(),
      projectLocalId: input.projectLocalId,
      ...localMeta(),
      geometry: input.geometry,
      metadata: input.metadata,
      detectionDateStart: input.detectionDateStart,
      detectionDateEnd: input.detectionDateEnd,
      remoteSourceId: input.sourceId,
    };
    await db.alerts.add(alert);
    return alert;
  });
}

export async function getAlerts(projectLocalId: string): Promise<Alert[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.alerts
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((a) => !a.deleted)
      .toArray();
  });
}

export async function getAlert(localId: string): Promise<Alert | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.alerts.get(localId);
  });
}

export async function updateAlert(
  localId: string,
  updates: AlertUpdates,
): Promise<Alert | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    await db.alerts.update(localId, { ...updates, updatedAt: timestamp() });
    return db.alerts.get(localId);
  });
}

export async function deleteAlert(localId: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.alerts.delete(localId);
  });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface CreateAttachmentInput {
  projectLocalId: string;
  observationLocalId: string;
  sourceDocId?: string;
  remoteUrl?: string;
  resolvedUrl?: string;
  mediaType?: 'photo' | 'audio' | 'unknown';
  contentType?: string;
  downloadStatus?: 'remote-only' | 'available' | 'failed';
}

export async function createAttachment(
  input: CreateAttachmentInput,
): Promise<Attachment> {
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }
    const observation = await db.observations.get(input.observationLocalId);
    if (!observation) {
      throw new DbError(
        'FK_VIOLATION',
        `Observation with localId "${input.observationLocalId}" does not exist`,
      );
    }
    const attachment: Attachment = {
      localId: uuid(),
      ...input,
      ...localMeta(),
    };
    await db.attachments.add(attachment);
    return attachment;
  });
}

export async function getAttachments(
  observationLocalId: string,
): Promise<Attachment[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.attachments
      .where('observationLocalId')
      .equals(observationLocalId)
      .filter((a) => !a.deleted)
      .toArray();
  });
}

export async function getAttachmentsForProject(
  projectLocalId: string,
): Promise<Attachment[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.attachments
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((a) => !a.deleted)
      .toArray();
  });
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export async function getTracks(projectLocalId: string): Promise<Track[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.tracks
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((t) => !t.deleted)
      .toArray();
  });
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export async function getFields(projectLocalId: string): Promise<Field[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.fields
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((f) => !f.deleted)
      .toArray();
  });
}

// ---------------------------------------------------------------------------
// Remote Servers
// ---------------------------------------------------------------------------

export interface CreateRemoteServerInput {
  baseUrl: string;
  label?: string;
  status?: string;
}

export type UpdateRemoteServerInput = Partial<Omit<RemoteServer, 'id'>>;

export async function createRemoteServer(
  input: CreateRemoteServerInput,
): Promise<RemoteServer> {
  return wrapDb(async () => {
    const db = getDb();
    const server: RemoteServer = {
      id: uuid(),
      baseUrl: input.baseUrl,
      label: input.label,
      status: input.status ?? 'idle',
      lastSyncedAt: '',
    };
    await db.remoteServers.add(server);
    return server;
  });
}

export async function getRemoteServers(): Promise<RemoteServer[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.toArray();
  });
}

export async function getRemoteServer(
  id: string,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.get(id);
  });
}

export async function getRemoteServerByBaseUrl(
  baseUrl: string,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.remoteServers.where('baseUrl').equals(baseUrl).first();
  });
}

export async function updateRemoteServer(
  id: string,
  updates: UpdateRemoteServerInput,
): Promise<RemoteServer | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    const persistedUpdates: UpdateRemoteServerInput = {};

    if ('baseUrl' in updates) persistedUpdates.baseUrl = updates.baseUrl;
    if ('label' in updates) persistedUpdates.label = updates.label;
    if ('status' in updates) persistedUpdates.status = updates.status;
    if ('lastSyncedAt' in updates) {
      persistedUpdates.lastSyncedAt = updates.lastSyncedAt;
    }
    if ('lastSuccessfulSyncAt' in updates) {
      persistedUpdates.lastSuccessfulSyncAt = updates.lastSuccessfulSyncAt;
    }
    if ('onboardingStatus' in updates) {
      persistedUpdates.onboardingStatus = updates.onboardingStatus;
    }
    if ('errorMessage' in updates) {
      persistedUpdates.errorMessage = updates.errorMessage;
    }

    await db.remoteServers.update(id, persistedUpdates);
    return db.remoteServers.get(id);
  });
}

export async function deleteRemoteServer(id: string): Promise<void> {
  return wrapDb(async () => {
    const db = getDb();
    await db.remoteServers.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Sync Metadata
// ---------------------------------------------------------------------------

export async function getSyncMetadata(): Promise<SyncMetadata[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.syncMetadata.toArray();
  });
}

export async function upsertSyncMetadata(
  meta: SyncMetadata,
): Promise<SyncMetadata> {
  return wrapDb(async () => {
    const db = getDb();
    await db.syncMetadata.put(meta);
    return meta;
  });
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function getPresets(projectLocalId: string): Promise<Preset[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.presets
      .where('projectLocalId')
      .equals(projectLocalId)
      .filter((p) => !p.deleted)
      .toArray();
  });
}

export async function getPreset(localId: string): Promise<Preset | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.presets.get(localId);
  });
}

export async function getPresetByRemoteId(
  projectLocalId: string,
  remoteId: string,
): Promise<Preset | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.presets
      .where('[projectLocalId+remoteId]')
      .equals([projectLocalId, remoteId])
      .filter((p) => !p.deleted)
      .first();
  });
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export type { CaseStatus };

export interface CreateCaseInput {
  projectLocalId: string;
  title: string;
  caseType: Case['caseType'];
  status?: CaseStatus;
}

export type CaseUpdates = {
  title?: string;
  caseType?: Case['caseType'];
  status?: CaseStatus;
};

/**
 * Create a new local Case. Requires title, caseType, projectLocalId, and a
 * non-empty owning project. Copies the owning project's remote namespace/remoteId
 * when available (provenance only — no remote Case sync).
 */
export async function createCase(input: CreateCaseInput): Promise<Case> {
  return wrapDb(async () => {
    const db = getDb();
    const project = await db.projects.get(input.projectLocalId);
    if (!project) {
      throw new DbError(
        'FK_VIOLATION',
        `Project with localId "${input.projectLocalId}" does not exist`,
      );
    }

    const now = timestamp();
    const caseRecord: Case = {
      localId: uuid(),
      projectLocalId: input.projectLocalId,
      title: input.title,
      caseType: input.caseType,
      status: input.status ?? 'draft',
      createdAt: now,
      updatedAt: now,
      revision: 1,
      createdBy: 'local',
      deleted: false,
      // Provenance: copy the owning project's remote namespace/remoteId only when
      // the project actually has a remote identity. Local projects have no
      // remoteId, so these fields stay undefined. These do NOT enable remote
      // Case sync (#275).
      remoteProjectNamespace: project.remoteId ? project.sourceType : undefined,
      remoteProjectId: project.remoteId,
    };
    await db.transaction('rw', [db.cases, db.caseActivity], async () => {
      await db.cases.add(caseRecord);
      await db.caseActivity.add({
        localId: uuid(),
        caseLocalId: caseRecord.localId,
        projectLocalId: caseRecord.projectLocalId,
        event: 'created',
        status: caseRecord.status,
        createdAt: now,
      });
    });
    return caseRecord;
  });
}

/**
 * List all (non-deleted) Cases for a project, scoped to `projectLocalId`.
 */
export async function getCases(projectLocalId: string): Promise<Case[]> {
  return wrapDb(async () => {
    const db = getDb();
    return db.cases
      .where('[projectLocalId+updatedAt]')
      .between(
        [projectLocalId, Dexie.minKey],
        [projectLocalId, Dexie.maxKey],
        true,
        true,
      )
      .reverse()
      .filter((c) => !c.deleted)
      .toArray();
  });
}

/**
 * Read a single Case by localId, scoped to its owning project. Returns
 * `undefined` if the Case does not exist OR belongs to a different project.
 */
export async function getCase(
  projectLocalId: string,
  localId: string,
): Promise<Case | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    const c = await db.cases.get(localId);
    if (!c || c.projectLocalId !== projectLocalId || c.deleted) {
      return undefined;
    }
    return c;
  });
}

/**
 * Update a Case, scoped to its owning project. Returns the updated Case, or
 * `undefined` if the Case does not exist / belongs to a different project.
 * Increments `revision` and stamps `updatedAt`.
 *
 * Only an explicit allowlist of user-editable foundation fields may be set:
 * title, caseType, and status. Identity (localId), ownership (projectLocalId),
 * provenance (createdBy, remoteProjectNamespace, remoteProjectId), and system
 * fields (createdAt, revision, deleted) are never mutated through this API,
 * even if a caller bypasses TypeScript.
 */
export async function updateCase(
  projectLocalId: string,
  localId: string,
  updates: CaseUpdates,
): Promise<Case | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    return db.transaction('rw', [db.cases, db.caseActivity], async () => {
      const existing = await db.cases.get(localId);
      if (
        !existing ||
        existing.projectLocalId !== projectLocalId ||
        existing.deleted
      ) {
        return undefined;
      }
      const nextRevision = existing.revision + 1;
      // Build the patch from ONLY the allowlisted fields. Any extra properties
      // in `updates` (e.g. via a runtime cast that bypasses TS) are silently
      // dropped — they must never reach the database.
      const patch: Partial<Case> = {
        revision: nextRevision,
        updatedAt: timestamp(),
      };
      // Only touch user-editable fields that were explicitly provided so
      // partial updates never clobber existing Case data with `undefined`.
      if (updates.title !== undefined) {
        patch.title = updates.title;
      }
      if (updates.caseType !== undefined) {
        patch.caseType = updates.caseType;
      }
      if (updates.status !== undefined) {
        patch.status = updates.status;
      }
      await db.cases.update(localId, patch);

      // Record a metadata-only activity event when the lifecycle status
      // changes. Reopen = transitioning out of Closed back to Active/Draft.
      if (updates.status !== undefined && updates.status !== existing.status) {
        const isReopen =
          existing.status === 'closed' && updates.status !== 'closed';
        const event = isReopen ? 'reopened' : 'status_changed';
        await db.caseActivity.add({
          localId: uuid(),
          caseLocalId: localId,
          projectLocalId,
          event,
          status: updates.status,
          createdAt: timestamp(),
        });
      }

      return db.cases.get(localId);
    });
  });
}

/**
 * Delete a single Case and its Case-owned rows (activity + report state),
 * scoped to its owning project. Returns `true` if a row was deleted.
 * This is a LOCAL-ONLY delete: it does not create tombstones, sync
 * metadata, upload jobs, or any #275 remote-sync semantics.
 */
export async function deleteCase(
  projectLocalId: string,
  localId: string,
): Promise<boolean> {
  return wrapDb(async () => {
    const db = getDb();
    const existing = await db.cases.get(localId);
    if (!existing || existing.projectLocalId !== projectLocalId) return false;
    await db.transaction(
      'rw',
      [db.cases, db.caseActivity, db.caseReportState],
      async () => {
        await db.caseActivity.where('caseLocalId').equals(localId).delete();
        await db.caseReportState.where('caseLocalId').equals(localId).delete();
        await db.cases.delete(localId);
      },
    );
    return true;
  });
}

// ---------------------------------------------------------------------------
// Case activity (metadata-only)
// ---------------------------------------------------------------------------

export interface CreateCaseActivityInput {
  caseLocalId: string;
  projectLocalId: string;
  event: CaseActivity['event'];
  status?: CaseStatus;
  agency?: CaseAgency;
  count?: number;
}

/**
 * Record a metadata-only activity event for a Case. Activity never duplicates
 * Case facts, report text, prompts, transcripts, media, or fabricated actor
 * names — only opaque ids, timestamps, and status/agency/count-like metadata.
 */
export async function recordCaseActivity(
  input: CreateCaseActivityInput,
): Promise<CaseActivity> {
  return wrapDb(async () => {
    const db = getDb();
    const caze = await db.cases.get(input.caseLocalId);
    if (!caze || caze.projectLocalId !== input.projectLocalId || caze.deleted) {
      throw new DbError(
        'NOT_FOUND',
        `Case with localId "${input.caseLocalId}" does not exist or does not belong to project "${input.projectLocalId}"`,
      );
    }
    const activity: CaseActivity = {
      localId: uuid(),
      caseLocalId: input.caseLocalId,
      projectLocalId: input.projectLocalId,
      event: input.event,
      status: input.status,
      agency: input.agency,
      count: input.count,
      createdAt: timestamp(),
    };
    await db.caseActivity.add(activity);
    return activity;
  });
}

/**
 * Timeline of metadata-only activity events for a Case, ordered by createdAt.
 *
 * Requires `projectLocalId` and enforces Case ownership: if the Case does not
 * exist or belongs to a different project, returns an empty array.
 */
export async function getCaseActivity(
  projectLocalId: string,
  caseLocalId: string,
): Promise<CaseActivity[]> {
  return wrapDb(async () => {
    const db = getDb();
    const caze = await db.cases.get(caseLocalId);
    if (!caze || caze.projectLocalId !== projectLocalId || caze.deleted) {
      return [];
    }
    return db.caseActivity
      .where('caseLocalId')
      .equals(caseLocalId)
      .filter((activity) => activity.projectLocalId === projectLocalId)
      .sortBy('createdAt');
  });
}

// ---------------------------------------------------------------------------
// Per-agency report state (independent per agency)
// ---------------------------------------------------------------------------

export interface UpsertCaseReportStateInput {
  caseLocalId: string;
  projectLocalId: string;
  agency: CaseAgency;
  status: CaseReportState['status'];
  count?: number;
  revision?: number;
}

/**
 * Upsert independent per-agency report-state for a Case.
 *
 * Each agency (FUNAI/IBAMA/MPF/PF) has its own row. Updating one agency never
 * mutates another. The stored shape is a status/configuration/provenance
 * placeholder only — no report bodies, templates, AI prompts, disclosure
 * payloads, PDFs, or provider credentials.
 *
 * Verifies that the Case exists and belongs to the supplied projectLocalId,
 * rejecting mismatched or cross-project pairs.
 */
export async function upsertCaseReportState(
  input: UpsertCaseReportStateInput,
): Promise<CaseReportState> {
  return wrapDb(async () => {
    const db = getDb();
    return db.transaction('rw', [db.cases, db.caseReportState], async () => {
      const caze = await db.cases.get(input.caseLocalId);
      if (!caze || caze.projectLocalId !== input.projectLocalId) {
        throw new DbError(
          'NOT_FOUND',
          `Case with localId "${input.caseLocalId}" does not exist or does not belong to project "${input.projectLocalId}"`,
        );
      }
      const now = timestamp();
      const existing = await db.caseReportState
        .where('[caseLocalId+agency]')
        .equals([input.caseLocalId, input.agency])
        .first();
      if (existing) {
        const nextRevision = input.revision ?? existing.revision + 1;
        await db.caseReportState.update(existing.localId, {
          status: input.status,
          count: input.count ?? existing.count,
          revision: nextRevision,
          updatedAt: now,
        });
        return db.caseReportState.get(
          existing.localId,
        ) as Promise<CaseReportState>;
      }
      const state: CaseReportState = {
        localId: uuid(),
        caseLocalId: input.caseLocalId,
        projectLocalId: input.projectLocalId,
        agency: input.agency,
        status: input.status,
        count: input.count,
        revision: input.revision ?? 1,
        createdAt: now,
        updatedAt: now,
      };
      await db.caseReportState.add(state);
      return state;
    });
  });
}

/**
 * Read a single agency's report state for a Case.
 *
 * Requires `projectLocalId` and enforces Case ownership: if the Case does not
 * exist or belongs to a different project, returns `undefined`.
 */
export async function getCaseReportState(
  projectLocalId: string,
  caseLocalId: string,
  agency: CaseAgency,
): Promise<CaseReportState | undefined> {
  return wrapDb(async () => {
    const db = getDb();
    const caze = await db.cases.get(caseLocalId);
    if (!caze || caze.projectLocalId !== projectLocalId) {
      return undefined;
    }
    return db.caseReportState
      .where('[caseLocalId+agency]')
      .equals([caseLocalId, agency])
      .first();
  });
}

/**
 * All per-agency report-state rows for a Case.
 *
 * Requires `projectLocalId` and enforces Case ownership: if the Case does not
 * exist or belongs to a different project, returns an empty array.
 */
export async function getCaseReportStates(
  projectLocalId: string,
  caseLocalId: string,
): Promise<CaseReportState[]> {
  return wrapDb(async () => {
    const db = getDb();
    const caze = await db.cases.get(caseLocalId);
    if (!caze || caze.projectLocalId !== projectLocalId) {
      return [];
    }
    return db.caseReportState
      .where('caseLocalId')
      .equals(caseLocalId)
      .toArray();
  });
}
