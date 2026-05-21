import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { InviteApiError, createEncryptedInvite } from '@/lib/api-client';
import {
  clearAllStorage,
  exportLocalStorageData,
  importLocalStorageData,
} from '@/lib/local-storage-utils';
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
  backupImportSuccess: {
    id: 'settings.backup.importSuccess',
    defaultMessage: 'Backup imported. Reloading…',
  },
  backupExportError: {
    id: 'settings.backup.exportError',
    defaultMessage: 'Failed to export backup.',
  },
  backupImportError: {
    id: 'settings.backup.importError',
    defaultMessage: 'Failed to import backup: {error}',
  },

  // Clear LocalStorage section
  clearTitle: {
    id: 'settings.clear.title',
    defaultMessage: 'Clear Local Data',
  },
  clearDescription: {
    id: 'settings.clear.description',
    defaultMessage:
      'Remove all local settings, preferences, and cached data. This cannot be undone.',
  },
  clearButton: {
    id: 'settings.clear.button',
    defaultMessage: 'Clear All Data',
  },
  clearConfirmTitle: {
    id: 'settings.clear.confirmTitle',
    defaultMessage: 'Clear All Data?',
  },
  clearConfirmDescription: {
    id: 'settings.clear.confirmDescription',
    defaultMessage:
      'This will permanently remove all local settings, preferences, and cached data. This action cannot be undone.',
  },
  clearConfirmButton: {
    id: 'settings.clear.confirmButton',
    defaultMessage: 'Yes, Clear Everything',
  },
  clearCancelButton: {
    id: 'settings.clear.cancelButton',
    defaultMessage: 'Cancel',
  },
});

const generateInviteSchema = v.object({
  remoteArchiveUrl: v.pipe(
    v.string(),
    v.nonEmpty('Required'),
    v.url('Invalid URL'),
  ),
  bearerToken: v.pipe(v.string(), v.nonEmpty('Required')),
});

type GenerateInviteForm = v.InferInput<typeof generateInviteSchema>;

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  pt: 'Portugu\u00eas',
  es: 'Espa\u00f1ol',
};

export function SettingsScreen() {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [exportStatus, setExportStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [importStatus, setImportStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateInviteForm>({
    resolver: valibotResolver(generateInviteSchema),
  });

  const onGenerate = useCallback(
    async (data: GenerateInviteForm) => {
      setGenerateError(null);
      try {
        const { code } = await createEncryptedInvite(
          data.remoteArchiveUrl,
          data.bearerToken,
        );
        const appOrigin = window.location.origin;
        setInviteUrl(`${appOrigin}/invite?code=${encodeURIComponent(code)}`);
        setInviteCode(code);
      } catch (err) {
        setInviteUrl(null);
        setInviteCode(null);
        if (
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
    [intl],
  );

  const copyToClipboard = useCallback(
    async (text: string, setCopied: (v: boolean) => void) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API may not be available in all environments
      }
    },
    [],
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
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch {
      setExportStatus('error');
    }
  }, []);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset input so re-importing the same file triggers onChange
      event.target.value = '';

      setImportStatus('loading');
      const reader = new FileReader();

      reader.onload = () => {
        const result = importLocalStorageData(reader.result as string);
        if (result.success) {
          setImportStatus('success');
          setTimeout(() => window.location.reload(), 500);
        } else {
          setImportStatus('error');
          setImportError(result.error ?? 'Unknown error');
        }
      };

      reader.onerror = () => {
        setImportStatus('error');
        setImportError(reader.error?.message ?? 'Failed to read file');
      };

      reader.readAsText(file);
    },
    [],
  );

  const handleClearAll = useCallback(async () => {
    await clearAllStorage();
    window.location.reload();
  }, []);

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

      {/* Remote Archive Invites */}
      <h2 className="text-lg font-semibold text-text mt-6">
        {intl.formatMessage(_messages.invitesTitle)}
      </h2>

      <form
        onSubmit={handleSubmit(onGenerate)}
        className="mt-4 space-y-4 max-w-md"
      >
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
            <div>
              <p className="text-sm text-text-muted mb-1">
                {intl.formatMessage(_messages.inviteUrlLabel)}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text truncate min-w-0">
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
            <div>
              <p className="text-sm text-text-muted mb-1">
                {intl.formatMessage(_messages.inviteCodeLabel)}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text min-w-0">
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
        <Button variant="secondary" onClick={handleExport} className="min-w-0">
          {intl.formatMessage(_messages.backupExportButton)}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={importStatus === 'loading'}
          disabled={importStatus === 'loading'}
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
      {importStatus === 'success' && (
        <p className="text-sm text-green-600 mt-2">
          {intl.formatMessage(_messages.backupImportSuccess)}
        </p>
      )}
      {importStatus === 'error' && importError && (
        <p className="text-sm text-error mt-2">
          {intl.formatMessage(_messages.backupImportError, {
            error: importError,
          })}
        </p>
      )}

      {/* Clear Local Data */}
      <h2 className="text-lg font-semibold text-text mt-6">
        {intl.formatMessage(_messages.clearTitle)}
      </h2>
      <p className="text-sm text-text-muted mt-2">
        {intl.formatMessage(_messages.clearDescription)}
      </p>
      <div className="mt-4 max-w-md">
        <Button
          variant="danger"
          onClick={() => setIsClearConfirmOpen(true)}
          className="w-full sm:w-auto"
        >
          {intl.formatMessage(_messages.clearButton)}
        </Button>
      </div>

      <Modal
        open={isClearConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setIsClearConfirmOpen(false);
        }}
        title={intl.formatMessage(_messages.clearConfirmTitle)}
        description={intl.formatMessage(_messages.clearConfirmDescription)}
      >
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsClearConfirmOpen(false)}
          >
            {intl.formatMessage(_messages.clearCancelButton)}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleClearAll}
          >
            {intl.formatMessage(_messages.clearConfirmButton)}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
