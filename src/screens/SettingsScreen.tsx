import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  useInviteTitle: {
    id: 'settings.invites.use.title',
    defaultMessage: 'Use an Invite',
  },
  useInviteCode: {
    id: 'settings.invites.use.code',
    defaultMessage: 'Invite Code',
  },
  useInviteConnect: {
    id: 'settings.invites.use.connect',
    defaultMessage: 'Connect',
  },
  connectedMessage: {
    id: 'settings.invites.use.connected',
    defaultMessage: 'Connected to {archive}',
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

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SettingsScreen() {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [useCode, setUseCode] = useState('');
  const [connected, setConnected] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateInviteForm>({
    resolver: valibotResolver(generateInviteSchema),
  });

  const onGenerate = useCallback(async (data: GenerateInviteForm) => {
    const hash = await sha256(data.remoteArchiveUrl + data.bearerToken);
    const shortHash = hash.slice(0, 24);
    setInviteUrl(`${data.remoteArchiveUrl}/invite?hash=${hash}`);
    setInviteCode(shortHash);
  }, []);

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

  const handleConnect = useCallback(() => {
    if (useCode.trim()) {
      setConnected(useCode.trim());
    }
  }, [useCode]);

  const LOCALE_LABELS: Record<string, string> = {
    en: 'English',
    pt: 'Portugu\u00eas',
    es: 'Espa\u00f1ol',
  };

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
        <Button type="submit">
          {intl.formatMessage(_messages.generateButton)}
        </Button>
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
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text truncate">
                  {inviteUrl}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(inviteUrl, setCopiedUrl)}
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
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface-card border border-border rounded-input px-3 py-2 text-sm text-text">
                  {inviteCode}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(inviteCode, setCopiedCode)}
                >
                  {copiedCode
                    ? intl.formatMessage(_messages.copiedButton)
                    : intl.formatMessage(_messages.copyButton)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Use an Invite */}
      <div className="mt-6 max-w-md">
        <h3 className="text-md font-semibold text-text mb-3">
          {intl.formatMessage(_messages.useInviteTitle)}
        </h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label={intl.formatMessage(_messages.useInviteCode)}
              placeholder={intl.formatMessage(_messages.useInviteCode)}
              value={useCode}
              onChange={(e) => setUseCode(e.target.value)}
            />
          </div>
          <Button onClick={handleConnect}>
            {intl.formatMessage(_messages.useInviteConnect)}
          </Button>
        </div>
        {connected && (
          <p className="mt-2 text-sm text-green-600">
            {intl.formatMessage(_messages.connectedMessage, {
              archive: connected,
            })}
          </p>
        )}
      </div>
    </section>
  );
}
