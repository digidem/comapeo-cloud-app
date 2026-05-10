import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

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
      <h1>{intl.formatMessage(_messages.settings)}</h1>

      <h2>Language / Idioma</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {SUPPORTED_LOCALES.map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => setLocale(loc)}
            disabled={locale === loc}
            style={{
              padding: '0.25rem 0.75rem',
              border:
                locale === loc ? '2px solid #1f6fff' : '1px solid #d9dee8',
              borderRadius: '8px',
              cursor: locale === loc ? 'default' : 'pointer',
              fontWeight: locale === loc ? 'bold' : 'normal',
              opacity: locale === loc ? 1 : 0.8,
            }}
          >
            {LOCALE_LABELS[loc] ?? loc}
          </button>
        ))}
      </div>

      <h2>{intl.formatMessage(_messages.archiveServers)}</h2>

      {servers.length > 0 && (
        <ul>
          {servers.map((s) => (
            <li key={s.id}>
              <strong>{s.label || s.baseUrl}</strong>
              <span>{s.baseUrl}</span>
              <span>{s.status}</span>
              {s.errorMessage && <em>{s.errorMessage}</em>}
              <button
                type="button"
                disabled={syncingId === s.id}
                onClick={() => handleSync(s.id)}
                className="cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingId === s.id
                  ? intl.formatMessage(_messages.syncing)
                  : intl.formatMessage(_messages.sync)}
              </button>
              <button
                type="button"
                onClick={() => removeServer(s.id)}
                className="cursor-pointer hover:underline"
              >
                {intl.formatMessage(_messages.remove)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {syncError && <p role="alert">{syncError}</p>}
      {formError && <p role="alert">{formError}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddServer();
        }}
      >
        <input
          type="text"
          aria-label={intl.formatMessage(_messages.serverUrl)}
          placeholder={intl.formatMessage(_messages.serverUrl)}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          type="password"
          aria-label={intl.formatMessage(_messages.serverToken)}
          placeholder={intl.formatMessage(_messages.serverToken)}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit" className="cursor-pointer hover:underline">
          {intl.formatMessage(_messages.addServer)}
        </button>
      </form>
    </section>
  );
}
