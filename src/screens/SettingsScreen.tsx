import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SUPPORTED_LOCALES } from '@/i18n/load-messages';
import { syncRemoteArchive } from '@/lib/data-layer';
import { useAuthStore } from '@/stores/auth-store';
import { useLocaleStore } from '@/stores/locale-store';

const _messages = defineMessages({
  settings: { id: 'settings.title', defaultMessage: 'Settings' },
  archiveServers: {
    id: 'settings.archiveServers',
    defaultMessage: 'Archive Servers',
  },
  addServer: {
    id: 'settings.addServer',
    defaultMessage: 'Add Server',
  },
  serverUrl: {
    id: 'settings.serverUrl',
    defaultMessage: 'Server URL',
  },
  serverToken: {
    id: 'settings.serverToken',
    defaultMessage: 'Bearer Token',
  },
  sync: {
    id: 'settings.sync',
    defaultMessage: 'Sync Now',
  },
  remove: {
    id: 'settings.remove',
    defaultMessage: 'Remove',
  },
  syncing: {
    id: 'settings.syncing',
    defaultMessage: 'Syncing...',
  },
});

export function SettingsScreen() {
  const intl = useIntl();
  const servers = useAuthStore((s) => s.servers);
  const addServer = useAuthStore((s) => s.addServer);
  const removeServer = useAuthStore((s) => s.removeServer);

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [label, setLabel] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddServer = async () => {
    if (!url || !token) {
      setFormError('URL and token are required');
      return;
    }
    setFormError(null);
    await addServer({ label: label || url, baseUrl: url, token });
    setUrl('');
    setToken('');
    setLabel('');
  };

  const handleSync = async (serverId: string) => {
    setSyncingId(serverId);
    setSyncError(null);
    try {
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      const result = await syncRemoteArchive(serverId, {
        baseUrl: server.baseUrl,
        token: server.token,
        serverLabel: server.label,
      });
      if (!result.success) {
        setSyncError(result.error ?? 'Sync failed');
      }
    } catch {
      setSyncError('Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const LOCALE_LABELS: Record<string, string> = {
    en: 'English',
    pt: 'Português',
    es: 'Español',
  };

  return (
    <section aria-label={intl.formatMessage(_messages.archiveServers)}>
      <h1 className="text-2xl font-bold text-text-heading">
        {intl.formatMessage(_messages.settings)}
      </h1>

      <h2 className="text-lg font-semibold text-text">Language / Idioma</h2>
      <div className="flex gap-2 mb-4">
        {SUPPORTED_LOCALES.map((loc) => (
          <Button
            key={loc}
            variant={locale === loc ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setLocale(loc)}
            disabled={locale === loc}
            className={locale === loc ? 'font-bold' : 'opacity-80'}
          >
            {LOCALE_LABELS[loc] ?? loc}
          </Button>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-text">
        {intl.formatMessage(_messages.archiveServers)}
      </h2>

      {servers.length > 0 && (
        <Card className="mt-2">
          <Card.Body>
            <ul className="flex flex-col gap-3">
              {servers.map((s) => (
                <li key={s.id} className="flex items-center gap-2 flex-wrap">
                  <strong className="text-text">{s.label || s.baseUrl}</strong>
                  <span className="text-text-muted text-sm">{s.baseUrl}</span>
                  <span className="text-text-muted text-xs">{s.status}</span>
                  {s.errorMessage && (
                    <em className="text-error text-xs">{s.errorMessage}</em>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={syncingId === s.id}
                    loading={syncingId === s.id}
                    onClick={() => handleSync(s.id)}
                  >
                    {syncingId === s.id
                      ? intl.formatMessage(_messages.syncing)
                      : intl.formatMessage(_messages.sync)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeServer(s.id)}
                  >
                    {intl.formatMessage(_messages.remove)}
                  </Button>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {syncError && (
        <p role="alert" className="text-error text-sm mt-2">
          {syncError}
        </p>
      )}
      {formError && (
        <p role="alert" className="text-error text-sm mt-2">
          {formError}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddServer();
        }}
        className="flex flex-col gap-3 mt-4"
      >
        <Input
          label={intl.formatMessage(_messages.serverUrl)}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          label={intl.formatMessage(_messages.serverToken)}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <div>
          <Input
            label="Label (optional)"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary">
          {intl.formatMessage(_messages.addServer)}
        </Button>
      </form>
    </section>
  );
}
