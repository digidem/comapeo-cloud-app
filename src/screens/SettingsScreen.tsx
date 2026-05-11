import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { SUPPORTED_LOCALES } from '@/i18n/load-messages';
import { useLocaleStore } from '@/stores/locale-store';

const _messages = defineMessages({
  settings: { id: 'settings.title', defaultMessage: 'Settings' },
});

export function SettingsScreen() {
  const intl = useIntl();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

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
      <div className="flex flex-wrap gap-2 mb-4">
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
    </section>
  );
}
