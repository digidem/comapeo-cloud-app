import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { StorageSettings } from '@/components/shared/StorageSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ApiError,
  InviteApiError,
  NetworkError,
  apiClient,
  createEncryptedInvite,
} from '@/lib/api-client';
import { syncRemoteArchive } from '@/lib/data-layer';
import type { Project } from '@/lib/db';
import { getProjects as getLocalProjects } from '@/lib/local-repositories';
import {
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';
import type { InviteAccessScope } from '@/lib/schemas/invite';
import { selectActiveServer, useAuthStore } from '@/stores/auth-store';
import { useLocaleStore } from '@/stores/locale-store';

const _messages = defineMessages({
  settings: { id: 'settings.title', defaultMessage: 'Settings' },
  invitesTitle: {
    id: 'settings.invites.title',
    defaultMessage: 'Remote Archive Invites',
  },
  generateUrl: {
    id: 'settings.invites.generate.url',
    defaultMessage: 'Remote Archive URL',
  },
  generateToken: {
    id: 'settings.invites.generate.token',
    defaultMessage: 'Bearer Token',
  },
  generateButton: {
    id: 'settings.invites.generate.button',
    defaultMessage: 'Generate Invite',
  },
  scopeArchiveWide: {
    id: 'settings.invites.scope.archiveWide',
    defaultMessage: 'Archive-wide',
  },
  scopeSpecificProject: {
    id: 'settings.invites.scope.specificProject',
    defaultMessage: 'Specific project',
  },
  scopedProjectUnavailable: {
    id: 'settings.invites.scope.unavailable',
    defaultMessage:
      'Full archive access is required to create project invitations.',
  },
  scopedProjectPlaceholder: {
    id: 'settings.invites.scope.projectPlaceholder',
    defaultMessage: 'Select a project',
  },
  scopedProjectRequired: {
    id: 'settings.invites.scope.projectRequired',
    defaultMessage: 'Select a project.',
  },
  scopedProjectUnsupported: {
    id: 'settings.invites.scope.unsupported',
    defaultMessage: 'This archive does not support project-scoped invitations.',
  },
  scopedProjectMissing: {
    id: 'settings.invites.scope.projectMissing',
    defaultMessage:
      'That project is no longer available. Refreshing project list.',
  },
  scopedProjectNetwork: {
    id: 'settings.invites.scope.networkError',
    defaultMessage:
      'Unable to reach the archive. Check your connection and try again.',
  },
  resultsTitle: {
    id: 'settings.invites.results.title',
    defaultMessage: 'Results',
  },
  inviteUrlLabel: {
    id: 'settings.invites.results.inviteUrl',
    defaultMessage: 'Invite URL',
  },
  inviteCodeLabel: {
    id: 'settings.invites.results.inviteCode',
    defaultMessage: 'Invite Code',
  },
  copyButton: {
    id: 'settings.invites.results.copy',
    defaultMessage: 'Copy',
  },
  copiedButton: {
    id: 'settings.invites.results.copied',
    defaultMessage: 'Copied!',
  },
  expiryNote: {
    id: 'settings.invites.results.expiryNote',
    defaultMessage: 'Expires in 24 hours.',
  },
  generateGenericError: {
    id: 'settings.invites.generate.errorGeneric',
    defaultMessage: "Couldn't generate invite. Try again.",
  },
  generateMissingKeyError: {
    id: 'settings.invites.generate.errorMissingKey',
    defaultMessage:
      'Server is not configured to issue encrypted invites — contact your administrator.',
  },

  // Backup/Restore section
  backupTitle: {
    id: 'settings.backup.title',
    defaultMessage: 'Backup & Restore',
  },
  backupDescription: {
    id: 'settings.backup.description',
    defaultMessage:
      'Export your local settings to a JSON file, or import a previously exported backup.',
  },
  backupExportButton: {
    id: 'settings.backup.exportButton',
    defaultMessage: 'Export Backup',
  },
  backupImportButton: {
    id: 'settings.backup.importButton',
    defaultMessage: 'Import Backup',
  },
  backupExportSuccess: {
    id: 'settings.backup.exportSuccess',
    defaultMessage: 'Backup exported successfully.',
  },
  backupExportError: {
    id: 'settings.backup.exportError',
    defaultMessage: 'Failed to export backup.',
  },
  backupImportError: {
    id: 'settings.backup.importError',
    defaultMessage: 'Failed to import backup: {error}',
  },
  backupInvalidFormat: {
    id: 'settings.backup.invalidFormat',
    defaultMessage: 'Invalid backup file format.',
  },
  backupStorageUnavailable: {
    id: 'settings.backup.storageUnavailable',
    defaultMessage:
      'Backup import failed because browser storage is unavailable. Existing preferences were restored.',
  },
  backupCompensationFailed: {
    id: 'settings.backup.compensationFailed',
    defaultMessage:
      'Backup import could not restore your previous preferences. Reloading to reconcile browser state.',
  },
  backupReadError: {
    id: 'settings.backup.readError',
    defaultMessage: 'The selected backup file could not be read.',
  },
});

const archiveInviteSchema = v.object({
  remoteArchiveUrl: v.pipe(
    v.string(),
    v.nonEmpty('Required'),
    v.url('Invalid URL'),
  ),
  bearerToken: v.pipe(v.string(), v.nonEmpty('Required')),
});

const generateInviteSchema = v.object({
  remoteArchiveUrl: v.optional(v.string(), ''),
  bearerToken: v.optional(v.string(), ''),
});

type GenerateInviteForm = v.InferInput<typeof generateInviteSchema>;
type InviteScopeChoice = 'archive' | 'project';

interface ProjectOption {
  label: string;
  remoteId: string;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  pt: 'Portugu\u00eas',
  es: 'Espa\u00f1ol',
};

function normalizeAccessScope(
  accessScope?: InviteAccessScope,
): InviteAccessScope {
  return accessScope ?? { type: 'archive' };
}

export function SettingsScreen() {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);
  const activeServer = useAuthStore((s) => selectActiveServer(s));
  const activeServerId = activeServer?.id;

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteScope, setInviteScope] = useState<InviteScopeChoice>('archive');
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [exportStatus, setExportStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [importStatus, setImportStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importReconciliationPending, setImportReconciliationPending] =
    useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<GenerateInviteForm>({
    resolver: valibotResolver(generateInviteSchema),
    defaultValues: { remoteArchiveUrl: '', bearerToken: '' },
  });

  const activeServerScope = normalizeAccessScope(activeServer?.accessScope);
  const canGenerateScopedInvite = Boolean(
    activeServer?.id &&
    activeServer.baseUrl &&
    activeServer.token &&
    activeServerScope.type === 'archive',
  );
  const resolvedInviteScope: InviteScopeChoice = canGenerateScopedInvite
    ? inviteScope
    : 'archive';

  const loadProjectOptions = useCallback(async (): Promise<ProjectOption[]> => {
    if (!activeServerId) {
      return [];
    }

    const projects = await getLocalProjects();
    return projects
      .filter((project): project is Project & { remoteId: string } =>
        Boolean(
          project.sourceType === 'remoteArchive' &&
          project.sourceId === activeServerId &&
          !project.deleted &&
          project.remoteId &&
          project.remoteId.trim().length > 0,
        ),
      )
      .map((project) => ({
        label: project.name ?? project.remoteId,
        remoteId: project.remoteId,
      }));
  }, [activeServerId]);

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutIdsRef.current) {
        clearTimeout(timeoutId);
      }
      timeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProjectOptions().then((options) => {
      if (!cancelled) {
        setProjectOptions(options);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadProjectOptions]);

  const scheduleTimeout = useCallback(
    (callback: () => void, delayMs: number) => {
      const timeoutId = setTimeout(() => {
        timeoutIdsRef.current = timeoutIdsRef.current.filter(
          (currentTimeoutId) => currentTimeoutId !== timeoutId,
        );
        callback();
      }, delayMs);
      timeoutIdsRef.current.push(timeoutId);
    },
    [],
  );

  const setGeneratedInvite = useCallback((code: string) => {
    const appOrigin = window.location.origin;
    setInviteUrl(`${appOrigin}/invite?code=${encodeURIComponent(code)}`);
    setInviteCode(code);
  }, []);

  const mapScopedInviteError = useCallback(
    (err: unknown): string => {
      if (err instanceof NetworkError) {
        return intl.formatMessage(_messages.scopedProjectNetwork);
      }
      if (err instanceof ApiError) {
        if (err.status === 403) {
          return intl.formatMessage(_messages.scopedProjectUnavailable);
        }
        if (
          err.status === 501 ||
          err.code === 'PROJECT_ACCESS_TOKENS_UNAVAILABLE'
        ) {
          return intl.formatMessage(_messages.scopedProjectUnsupported);
        }
        if (err.status === 404 || err.kind === 'missing-project') {
          return intl.formatMessage(_messages.scopedProjectMissing);
        }
      }
      return intl.formatMessage(_messages.generateGenericError);
    },
    [intl],
  );

  const refreshActiveArchiveProjects = useCallback(() => {
    if (!activeServer?.id || !activeServer.baseUrl || !activeServer.token) {
      return;
    }
    void syncRemoteArchive(activeServer.id, {
      baseUrl: activeServer.baseUrl,
      token: activeServer.token,
      accessScope: normalizeAccessScope(activeServer.accessScope),
    }).finally(() => {
      void loadProjectOptions().then(setProjectOptions);
    });
  }, [activeServer, loadProjectOptions]);

  const onGenerate = useCallback(
    async (data: GenerateInviteForm) => {
      setGenerateError(null);
      setInviteUrl(null);
      setInviteCode(null);
      clearErrors();

      try {
        if (resolvedInviteScope === 'project') {
          if (!canGenerateScopedInvite || !activeServer) {
            setGenerateError(
              intl.formatMessage(_messages.scopedProjectUnavailable),
            );
            return;
          }
          if (!selectedProjectId) {
            setGenerateError(
              intl.formatMessage(_messages.scopedProjectRequired),
            );
            return;
          }

          const minted = await apiClient.createProjectAccessToken(
            selectedProjectId,
            { baseUrl: activeServer.baseUrl, token: activeServer.token },
          );
          if (minted.projectId !== selectedProjectId) {
            throw new ApiError(
              200,
              'PROJECT_ACCESS_TOKEN_PROJECT_MISMATCH',
              'Project access token response did not match the selected project',
            );
          }
          const scope: InviteAccessScope = {
            type: 'project',
            projectId: selectedProjectId,
          };
          const { code } = await createEncryptedInvite(
            activeServer.baseUrl,
            minted.token,
            24,
            scope,
          );
          setGeneratedInvite(code);
          return;
        }

        const parsed = v.safeParse(archiveInviteSchema, data);
        if (!parsed.success) {
          for (const issue of parsed.issues) {
            const key = issue.path?.[0]?.key;
            if (key === 'remoteArchiveUrl' || key === 'bearerToken') {
              setError(key, { message: issue.message });
            }
          }
          return;
        }

        const { code } = await createEncryptedInvite(
          parsed.output.remoteArchiveUrl,
          parsed.output.bearerToken,
        );
        setGeneratedInvite(code);
      } catch (err) {
        if (resolvedInviteScope === 'project') {
          setGenerateError(mapScopedInviteError(err));
          if (
            err instanceof ApiError &&
            (err.status === 404 || err.kind === 'missing-project')
          ) {
            refreshActiveArchiveProjects();
          }
        } else if (
          err instanceof InviteApiError &&
          err.code === 'INVITE_KEY_MISSING'
        ) {
          setGenerateError(
            intl.formatMessage(_messages.generateMissingKeyError),
          );
        } else {
          setGenerateError(intl.formatMessage(_messages.generateGenericError));
        }
      }
    },
    [
      activeServer,
      canGenerateScopedInvite,
      clearErrors,
      intl,
      resolvedInviteScope,
      mapScopedInviteError,
      refreshActiveArchiveProjects,
      selectedProjectId,
      setError,
      setGeneratedInvite,
    ],
  );

  const copyToClipboard = useCallback(
    async (text: string, setCopied: (v: boolean) => void) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        scheduleTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API may not be available in all environments
      }
    },
    [scheduleTimeout],
  );

  const handleExport = useCallback(() => {
    try {
      const json = exportLocalStorageData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comapeo-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('success');
      scheduleTimeout(() => setExportStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to export local storage backup', error);
      setExportStatus('error');
    }
  }, [scheduleTimeout]);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset input so re-importing the same file triggers onChange
      event.target.value = '';

      setImportStatus('loading');
      setImportError(null);
      setImportReconciliationPending(false);
      const reader = new FileReader();

      reader.onload = () => {
        const result = importLocalStorageData(reader.result as string);
        if (result.success) {
          // Reload immediately so live persisted stores cannot overwrite restored
          // preferences between import and app rehydration.
          window.location.reload();
        } else {
          setImportStatus('error');
          if (result.error === 'compensation-failed') {
            setImportError(
              intl.formatMessage(_messages.backupCompensationFailed),
            );
            setImportReconciliationPending(true);
            // Keep backup controls disabled while an assertive warning is available
            // to assistive technology, then reconcile live stores by reloading.
            // This recovery timer must survive component unmount/navigation.
            window.setTimeout(() => window.location.reload(), 1500);
          } else {
            setImportError(
              intl.formatMessage(
                result.error === 'storage-unavailable'
                  ? _messages.backupStorageUnavailable
                  : _messages.backupInvalidFormat,
              ),
            );
          }
        }
      };

      reader.onerror = () => {
        setImportStatus('error');
        setImportError(intl.formatMessage(_messages.backupReadError));
      };

      reader.readAsText(file);
    },
    [intl],
  );

  return (
    <section className="p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text-heading">
        {intl.formatMessage(_messages.settings)}
      </h1>

      <h2 className="text-lg font-semibold text-text mt-6">
        Language / Idioma
      </h2>
      <p className="text-sm text-text-muted mt-2">
        Change language from the top navigation bar.
      </p>
      <p className="text-xs text-text-muted mt-1">
        Current: {LOCALE_LABELS[locale] ?? locale}
      </p>

      {/* Storage */}
      <StorageSettings />

      {/* Remote Archive Invites */}
      <h2 className="text-lg font-semibold text-text mt-6">
        {intl.formatMessage(_messages.invitesTitle)}
      </h2>

      <form
        onSubmit={handleSubmit(onGenerate)}
        className="mt-4 space-y-4 max-w-md"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text">
            {intl.formatMessage(_messages.scopeSpecificProject)}
          </legend>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-text">
            <input
              type="radio"
              name="invite-scope"
              value="archive"
              checked={resolvedInviteScope === 'archive'}
              onChange={() => {
                setInviteScope('archive');
                setSelectedProjectId('');
                setGenerateError(null);
              }}
            />
            {intl.formatMessage(_messages.scopeArchiveWide)}
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-text">
            <input
              type="radio"
              name="invite-scope"
              value="project"
              checked={resolvedInviteScope === 'project'}
              disabled={!canGenerateScopedInvite}
              onChange={() => {
                setInviteScope('project');
                setGenerateError(null);
                void loadProjectOptions().then(setProjectOptions);
              }}
            />
            {intl.formatMessage(_messages.scopeSpecificProject)}
          </label>
          {!canGenerateScopedInvite && (
            <p className="text-xs text-text-muted">
              {intl.formatMessage(_messages.scopedProjectUnavailable)}
            </p>
          )}
        </fieldset>

        {resolvedInviteScope === 'project' && canGenerateScopedInvite && (
          <div className="flex flex-col gap-1">
            <select
              aria-label={intl.formatMessage(_messages.scopeSpecificProject)}
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="w-full rounded-input border border-border bg-surface-card px-3 py-2 min-h-[44px] text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
            >
              <option value="">
                {intl.formatMessage(_messages.scopedProjectPlaceholder)}
              </option>
              {projectOptions.map((project) => (
                <option key={project.remoteId} value={project.remoteId}>
                  {project.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <Input
          label={intl.formatMessage(_messages.generateUrl)}
          placeholder="https://archive.example.com"
          error={errors.remoteArchiveUrl?.message}
          {...register('remoteArchiveUrl')}
        />
        <Input
          label={intl.formatMessage(_messages.generateToken)}
          placeholder={intl.formatMessage(_messages.generateToken)}
          type="password"
          error={errors.bearerToken?.message}
          {...register('bearerToken')}
        />
        <Button type="submit" className="w-full sm:w-auto">
          {intl.formatMessage(_messages.generateButton)}
        </Button>
        {generateError && <p className="text-sm text-error">{generateError}</p>}
      </form>

      {/* Results */}
      {inviteUrl && inviteCode && (
        <div className="mt-6 max-w-md">
          <h3 className="text-md font-semibold text-text mb-3">
            {intl.formatMessage(_messages.resultsTitle)}
          </h3>
          <div className="space-y-3">
            <div data-testid="invite-url-row">
              <p className="text-sm text-text-muted mb-1">
                {intl.formatMessage(_messages.inviteUrlLabel)}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text break-words wrap-anywhere min-w-0">
                  {inviteUrl}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(inviteUrl, setCopiedUrl)}
                  className="shrink-0"
                >
                  {copiedUrl
                    ? intl.formatMessage(_messages.copiedButton)
                    : intl.formatMessage(_messages.copyButton)}
                </Button>
              </div>
            </div>
            <div data-testid="invite-code-row">
              <p className="text-sm text-text-muted mb-1">
                {intl.formatMessage(_messages.inviteCodeLabel)}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text break-words wrap-anywhere min-w-0">
                  {inviteCode}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(inviteCode, setCopiedCode)}
                  className="shrink-0"
                >
                  {copiedCode
                    ? intl.formatMessage(_messages.copiedButton)
                    : intl.formatMessage(_messages.copyButton)}
                </Button>
              </div>
            </div>
            <p className="text-xs text-text-muted">
              {intl.formatMessage(_messages.expiryNote)}
            </p>
          </div>
        </div>
      )}

      {/* Backup & Restore */}
      <h2 className="text-lg font-semibold text-text mt-6">
        {intl.formatMessage(_messages.backupTitle)}
      </h2>
      <p className="text-sm text-text-muted mt-2">
        {intl.formatMessage(_messages.backupDescription)}
      </p>
      <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-3 max-w-md">
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          onChange={handleImport}
          className="hidden"
          data-testid="backup-file-input"
        />
        <Button
          variant="secondary"
          onClick={handleExport}
          disabled={importReconciliationPending}
          className="min-w-0"
        >
          {intl.formatMessage(_messages.backupExportButton)}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={importStatus === 'loading'}
          disabled={importStatus === 'loading' || importReconciliationPending}
          className="min-w-0"
        >
          {intl.formatMessage(_messages.backupImportButton)}
        </Button>
      </div>
      {exportStatus === 'success' && (
        <p className="text-sm text-green-600 mt-2">
          {intl.formatMessage(_messages.backupExportSuccess)}
        </p>
      )}
      {exportStatus === 'error' && (
        <p className="text-sm text-error mt-2">
          {intl.formatMessage(_messages.backupExportError)}
        </p>
      )}
      {importStatus === 'error' && importError && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-sm text-error mt-2"
        >
          {intl.formatMessage(_messages.backupImportError, {
            error: importError,
          })}
        </p>
      )}
    </section>
  );
}
