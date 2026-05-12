import { defineMessages, useIntl } from 'react-intl';

import { useLocaleStore } from '@/stores/locale-store';

const _messages = defineMessages({
  settings: { id: 'settings.title', defaultMessage: 'Settings' },
});

export function SettingsScreen() {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);

  const LOCALE_LABELS: Record<string, string> = {
    en: 'English',
    pt: 'Português',
    es: 'Español',
  };

  return (
    <section className="p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text-heading">
        {intl.formatMessage(_messages.settings)}
      </h1>

      <h2 className="text-lg font-semibold text-text">Language / Idioma</h2>
      <p className="text-sm text-text-muted mt-2">
        Change language from the top navigation bar.
      </p>
      <p className="text-xs text-text-muted mt-1">
        Current: {LOCALE_LABELS[locale] ?? locale}
      </p>
    </section>
  );
}
